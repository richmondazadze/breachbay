#!/usr/bin/env bash
# Linux-only isolated shell-control check; no real sudo/services/env/state used.
set -euo pipefail
source_script="${1:?Pass the deployment build-release.sh path}"
task_dir="$(mktemp -d)"
trap 'rm -rf "$task_dir"' EXIT
mkdir -p "$task_dir/runtime/node/bin" "$task_dir/releases/previous" "$task_dir/source" "$task_dir/private"
ln -s "$task_dir/releases/previous" "$task_dir/current"
touch "$task_dir/private/application.env"
tar -czf "$task_dir/source.tar.gz" -C "$task_dir/source" .
python3 - "$source_script" "$task_dir" <<'PY'
import pathlib, sys
source = pathlib.Path(sys.argv[1]).read_text()
root = sys.argv[2]
source = source.replace('/opt/breachbay', root)
source = source.replace('/etc/breachbay/application.env', root + '/private/application.env')
source = source.replace('/tmp/breachbay-source.tar.gz', root + '/source.tar.gz')
pathlib.Path(root + '/run.sh').write_text(source)
PY
cat > "$task_dir/runtime/node/bin/sudo" <<'SH'
#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  chown|chmod) exit 0 ;;
  systemctl)
    [[ "$2" != restart ]] || printf 'restart\n' >> "$BREACHBAY_RELEASE_TEST_DIR/restarts"
    exit 0 ;;
  mkdir|tar|ln|mv|bash) exec "$@" ;;
  *) exit 99 ;;
esac
SH
cat > "$task_dir/runtime/node/bin/npm" <<'SH'
#!/usr/bin/env bash
mkdir -p .next
touch .next/BUILD_ID
SH
cat > "$task_dir/runtime/node/bin/node" <<'SH'
#!/usr/bin/env bash
exit "$BREACHBAY_RELEASE_TEST_HEALTH"
SH
chmod +x "$task_dir/runtime/node/bin/"*
export BREACHBAY_RELEASE_TEST_DIR="$task_dir"
export PATH="$task_dir/runtime/node/bin:/usr/bin:/bin"
export BREACHBAY_RELEASE_TEST_HEALTH=1
if bash "$task_dir/run.sh" > "$task_dir/failure.log" 2>&1; then
  printf 'FAIL: failed startup was accepted\n' >&2
  exit 1
fi
[[ "$(readlink -f "$task_dir/current")" == "$task_dir/releases/previous" ]]
[[ "$(wc -l < "$task_dir/restarts")" -eq 2 ]]
grep -q 'previous application release restored' "$task_dir/failure.log"
rm "$task_dir/restarts"
export BREACHBAY_RELEASE_TEST_HEALTH=0
bash "$task_dir/run.sh" > "$task_dir/success.log" 2>&1
[[ "$(readlink -f "$task_dir/current")" != "$task_dir/releases/previous" ]]
[[ "$(wc -l < "$task_dir/restarts")" -eq 1 ]]
rm "$task_dir/restarts"
before_prepare="$(readlink -f "$task_dir/current")"
bash "$task_dir/run.sh" --prepare-only > "$task_dir/prepare.log" 2>&1
[[ "$(readlink -f "$task_dir/current")" == "$before_prepare" ]]
[[ ! -e "$task_dir/restarts" ]]
prepared="$(sed -n 's/^Prepared release: //p' "$task_dir/prepare.log")"
[[ -f "$prepared/.next/BUILD_ID" ]]
export BREACHBAY_RELEASE_TEST_HEALTH=1
if bash "$task_dir/run.sh" --activate-only "$prepared" > "$task_dir/staged-failure.log" 2>&1; then
  printf 'FAIL: staged failed startup was accepted\n' >&2
  exit 1
fi
[[ "$(readlink -f "$task_dir/current")" == "$before_prepare" ]]
[[ "$(wc -l < "$task_dir/restarts")" -eq 2 ]]
rm "$task_dir/restarts"
export BREACHBAY_RELEASE_TEST_HEALTH=0
bash "$task_dir/run.sh" --activate-only "$prepared" > "$task_dir/activate.log" 2>&1
[[ "$(readlink -f "$task_dir/current")" == "$prepared" ]]
[[ "$(wc -l < "$task_dir/restarts")" -eq 1 ]]
printf 'PASS: isolated rollback, preparation without promotion, staged rollback and staged activation; no production state changed\n'
