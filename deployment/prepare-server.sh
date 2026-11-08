#!/usr/bin/env bash
set -euo pipefail
for account in breachbay breachbaydb; do
  if ! id "$account" >/dev/null 2>&1; then sudo useradd --system --user-group --home-dir "/var/lib/$account" --shell /usr/sbin/nologin "$account"; fi
done
sudo install -d -m 700 -o breachbay -g breachbay /var/lib/breachbay /var/lib/breachbay/evidence
sudo install -d -m 700 -o breachbaydb -g breachbaydb /var/lib/breachbaydb
sudo install -d -m 750 -o root -g breachbay /etc/breachbay
sudo install -d -m 755 /opt/breachbay/releases
sudo install -m 600 /tmp/breachbay-production.env /etc/breachbay/application.env
sudo rm /tmp/breachbay-production.env
sudo install -m 644 /tmp/breachbay.service /etc/systemd/system/breachbay.service
sudo install -m 644 /tmp/breachbay-db.service /etc/systemd/system/breachbay-db.service
if ! sudo test -f /var/lib/breachbaydb/private.pem; then
  sudo -u breachbaydb openssl ecparam -name prime256v1 -genkey -noout -out /var/lib/breachbaydb/ec.pem
  sudo -u breachbaydb openssl pkcs8 -topk8 -nocrypt -in /var/lib/breachbaydb/ec.pem -out /var/lib/breachbaydb/private.pem
  sudo -u breachbaydb openssl ec -in /var/lib/breachbaydb/ec.pem -pubout -out /var/lib/breachbaydb/public.pem 2>/dev/null
  sudo rm /var/lib/breachbaydb/ec.pem
fi
sudo find /var/lib/breachbaydb -maxdepth 1 -name '*.pem' -exec chmod 600 {} +
sudo systemctl daemon-reload
sudo systemctl enable --now breachbay-db
sudo systemctl is-active breachbay-db
