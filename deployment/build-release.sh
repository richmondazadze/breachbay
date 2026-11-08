#!/usr/bin/env bash
set -euo pipefail
mode="${1:-build}"
case "$mode" in
  build|--prepare-only) release="/opt/breachbay/releases/$(date -u +%Y%m%dT%H%M%SZ)-$$" ;;
  --activate-only)
    release="$(readlink -f "${2:?Pass the prepared release directory}")"
    [[ "$release" == /opt/breachbay/releases/* && -f "$release/.next/BUILD_ID" ]] || {
      printf 'Prepared application release required.\n' >&2; exit 1;
    }
    ;;
  *) printf 'Use --prepare-only, --activate-only PATH, or no arguments.\n' >&2; exit 1 ;;
esac
previous="$(readlink -f /opt/breachbay/current 2>/dev/null || true)"
switched=false
rollback() {
  local result=$?
  if (( result != 0 )) && "$switched" && [[ -n "$previous" ]]; then
    sudo ln -s "$previous" "/opt/breachbay/current.rollback.$$"
    sudo mv -Tf "/opt/breachbay/current.rollback.$$" /opt/breachbay/current
    sudo systemctl restart breachbay
    printf 'Release failed; previous application release restored. Database and evidence retained.\n' >&2
  fi
  exit "$result"
}
trap rollback EXIT
export PATH=/opt/breachbay/runtime/node/bin:/usr/bin:/bin
if [[ "$mode" != --activate-only ]]; then
  sudo mkdir -p "$release"
  sudo tar -xzf /tmp/breachbay-source.tar.gz -C "$release"
  sudo chown -R linuxuser:linuxuser "$release"
  cd "$release"
  npm ci --no-fund --no-audit
  sudo bash -c 'set -a; . /etc/breachbay/application.env; set +a; export PATH=/opt/breachbay/runtime/node/bin:/usr/bin:/bin; export NEXT_TELEMETRY_DISABLED=1; npm run build'
  if [[ "$mode" == --prepare-only ]]; then
    printf 'Prepared release: %s\n' "$release"
    exit 0
  fi
else
  cd "$release"
fi
sudo chown -R root:breachbay "$release"
sudo chmod -R g+rX,o-rwx "$release"
sudo chown -R breachbay:breachbay "$release/.next"
sudo ln -s "$release" "/opt/breachbay/current.next.$$"
sudo mv -Tf "/opt/breachbay/current.next.$$" /opt/breachbay/current
switched=true
sudo systemctl enable --now breachbay
sudo systemctl restart breachbay
sudo systemctl is-active breachbay
# The health route describes configuration, so absent inference is allowed here.
# This probe verifies the new app is serving its expected runtime and core config.
node --input-type=module <<'JS'
let available = false;
for (let attempt = 0; attempt < 20; attempt++) {
  try {
    const response = await fetch('http://127.0.0.1:3000/api/health', {signal: AbortSignal.timeout(2000)});
    const body = await response.json();
    if (response.ok && body.version === '0.1.0' && body.spacetimeVersion === '2.14.1' &&
        body.dependencies?.authentication === true && body.dependencies?.backend === true &&
        body.dependencies?.evidenceStorage === true) {
      available = true;
      break;
    }
  } catch {}
  await new Promise(resolve => setTimeout(resolve, 1000));
}
if (!available) {
  process.stderr.write('Application startup health check failed.\n');
  process.exitCode = 1;
} else {
  process.stdout.write('PASS: application startup and core configuration; provider acceptance remains separate.\n');
}
JS
