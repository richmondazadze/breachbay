#!/usr/bin/env bash
set -euo pipefail
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
cd "$work"
curl -fsSLO https://nodejs.org/dist/v26.13.0/node-v26.13.0-linux-x64.tar.xz
curl -fsSLO https://nodejs.org/dist/v26.13.0/SHASUMS256.txt
rg_cmd=grep
"$rg_cmd" ' node-v26.13.0-linux-x64.tar.xz$' SHASUMS256.txt | sha256sum -c -
sudo mkdir -p /opt/breachbay/runtime/node
sudo tar -xJf node-v26.13.0-linux-x64.tar.xz --strip-components=1 -C /opt/breachbay/runtime/node
curl -fsSLo spacetime.tar.gz https://github.com/clockworklabs/SpacetimeDB/releases/download/v2.14.1/spacetime-x86_64-unknown-linux-gnu.tar.gz
printf '%s  %s\n' '67a3c99c19abc4ba58b4ab999b309b3c5899602b3f0f7ae75e296335c174c82b' spacetime.tar.gz | sha256sum -c -
sudo mkdir -p /opt/breachbay/runtime/spacetime
sudo tar -xzf spacetime.tar.gz -C /opt/breachbay/runtime/spacetime
/opt/breachbay/runtime/node/bin/node --version
ls /opt/breachbay/runtime/spacetime
