#!/usr/bin/env bash
set -euo pipefail
sudo rm -f /etc/nginx/sites-enabled/default
sudo install -m 644 /tmp/nginx.conf /etc/nginx/conf.d/breachbay.conf
sudo nginx -t
sudo systemctl restart nginx
sudo install -m 644 /tmp/Caddyfile /etc/caddy/Caddyfile
sudo caddy validate --config /etc/caddy/Caddyfile
sudo systemctl restart caddy
sudo systemctl enable nginx caddy
