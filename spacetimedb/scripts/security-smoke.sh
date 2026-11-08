#!/usr/bin/env bash
set -euo pipefail
# Run from repository root. Uses real Spacetime and synthetic JWTs only.
# Released Spacetime rejects loopback HTTP egress, so the signature validator needs temporary TLS ingress.
for executable in spacetime cloudflared openssl curl node; do command -v "$executable" >/dev/null || { echo "Missing dependency: $executable" >&2; exit 1; }; done
spacetime --version | rg -q 'spacetimedb tool version 2\.14\.1;' || { echo 'Spacetime CLI 2.14.1 required' >&2; exit 1; }
test_dir=$(mktemp -d "${TMPDIR:-/tmp}/breachbay-security.XXXXXX")
chmod 700 "$test_dir"
server_pid=''
tunnel_pid=''
cleanup() { if [[ -n "$tunnel_pid" ]]; then kill "$tunnel_pid" 2>/dev/null || true; fi; if [[ -n "$server_pid" ]]; then kill "$server_pid" 2>/dev/null || true; fi; rm -rf "$test_dir"; }
trap cleanup EXIT
port=${BREACHBAY_TEST_PORT:-3110}
openssl ecparam -name prime256v1 -genkey -noout -out "$test_dir/ec.pem"
openssl pkcs8 -topk8 -nocrypt -in "$test_dir/ec.pem" -out "$test_dir/private.pem"
openssl ec -in "$test_dir/ec.pem" -pubout -out "$test_dir/public.pem" 2>/dev/null
chmod 600 "$test_dir"/*.pem
spacetime start --listen-addr "127.0.0.1:$port" --data-dir "$test_dir/data" --jwt-pub-key-path "$test_dir/public.pem" --jwt-priv-key-path "$test_dir/private.pem" --non-interactive >"$test_dir/server.log" 2>&1 &
server_pid=$!
for attempt in $(seq 1 60); do if curl -fsS "http://127.0.0.1:$port/v1/identity/public-key" >/dev/null 2>&1; then break; fi; sleep 0.5; done
cloudflared tunnel --url http://127.0.0.1:3111 --no-autoupdate --logfile "$test_dir/tunnel.log" >"$test_dir/tunnel-output.log" 2>&1 &
tunnel_pid=$!
tunnel_url=''
for attempt in $(seq 1 60); do tunnel_url=$(rg -o 'https://[a-z-]+\.trycloudflare\.com' "$test_dir/tunnel.log" 2>/dev/null | head -1 || true); if [[ -n "$tunnel_url" ]]; then break; fi; sleep 0.5; done
[[ -n "$tunnel_url" ]] || { echo 'Synthetic validation TLS tunnel unavailable' >&2; exit 1; }
# Wait for tunnel registration before the module asks it to validate fixture tokens.
for attempt in $(seq 1 60); do if rg -q 'Registered tunnel connection' "$test_dir/tunnel.log"; then break; fi; sleep 0.5; done
database="breachbay-security-$(date +%s)-$RANDOM"
AUTH_VALIDATION_URL="$tunnel_url/api/auth/validate" OIDC_ISSUER=localhost OIDC_AUDIENCE=breachbay-test BOOTSTRAP_COMMANDER_SUBJECTS=alice,dave SERVICE_SUBJECTS=ai spacetime publish --server "http://127.0.0.1:$port" --module-path spacetimedb --no-config --yes=skip-login "$database"
if ! BREACHBAY_TEST_ENDPOINT="http://127.0.0.1:$port" BREACHBAY_TEST_DATABASE="$database" BREACHBAY_TEST_KEY_PATH="$test_dir/private.pem" BREACHBAY_TEST_PUBLIC_KEY_PATH="$test_dir/public.pem" node_modules/.bin/tsx src/lib/backend/tests/live-security.ts; then
  spacetime logs --server "http://127.0.0.1:$port" --no-config "$database" --num-lines 12
  exit 1
fi
if [[ "${BREACHBAY_SECURITY_SMOKE_SCOPE:-}" != "completion-gaps" ]]; then node_modules/.bin/tsx src/lib/backend/tests/clerk-security.ts; fi
