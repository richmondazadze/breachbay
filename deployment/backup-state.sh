#!/usr/bin/env bash
# Run with sudo on the BreachBay host. Archives never leave the protected server directory.
set -euo pipefail
[[ "$(id -u)" -eq 0 ]] || { printf 'Run this backup as root.\n' >&2; exit 1; }
umask 077
task_backup="/var/backups/breachbay/$(date -u +%Y%m%dT%H%M%SZ)-$$"
install -d -m 700 /var/backups/breachbay "$task_backup"
task_stopped=false
finish() {
  local task_result=$?
  if "$task_stopped"; then
    if ! systemctl start breachbay-db breachbay; then
      printf 'Service restart requires operator attention. Protected backup retained.\n' >&2
      exit 1
    fi
  fi
  exit "$task_result"
}
trap finish EXIT
task_stopped=true
systemctl stop breachbay breachbay-db
tar -czf "$task_backup/state.tar.gz" -C / \
  var/lib/breachbaydb var/lib/breachbay/evidence \
  etc/breachbay/application.env home/linuxuser/.config/breachbay home/linuxuser/.config/spacetime
chmod 600 "$task_backup/state.tar.gz"
printf 'PASS: consistent offline state/configuration archive retained in protected server backup directory\n'
