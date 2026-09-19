#!/usr/bin/env bash
#
# Hubify Mail — Postfix domain watcher (Coolify Opsi A hybrid)
#
# Tugas: samakan virtual_mailbox_domains Postfix host dengan domain aktif di DB.
# Dipasang sekali sebagai cron root (tiap 2 menit):
#   */2 * * * * /bin/bash /opt/hubify-mail-backend/postfix/sync-domains-watcher.sh >> /var/log/hubify-postfix-sync.log 2>&1
#
# Dengan ini, alur tambah domain = cukup dari Admin Dashboard
# (tambah -> verifikasi DNS -> aktifkan). Tidak perlu sentuh VPS/DB lagi.
# Pengaman: tidak mengubah apa-apa bila DB tidak reachable atau hasilnya kosong.
#
set -uo pipefail

ENV_FILE="/opt/hubify-mail-backend/.env"
[ -f "$ENV_FILE" ] || exit 0

# shellcheck disable=SC1090
set -a
# shellcheck source=/dev/null
. "$ENV_FILE"
set +a

[ -n "${DATABASE_URL:-}" ] || exit 0
command -v psql >/dev/null 2>&1 || exit 0
command -v postconf >/dev/null 2>&1 || exit 0

WANT="$(psql "$DATABASE_URL" -tAX -c "SELECT domain FROM domains WHERE is_active AND verification_status = 'active' ORDER BY 1;" 2>/dev/null | tr '\n' ' ' | xargs)" || exit 0
[ -n "$WANT" ] || exit 0

norm() { printf '%s' "$1" | tr ' ,' '\n\n' | sed '/^[[:space:]]*$/d' | sort -u | tr '\n' ' ' | xargs; }

HAVE="$(postconf -h virtual_mailbox_domains 2>/dev/null || true)"

if [ "$(norm "$WANT")" != "$(norm "$HAVE")" ]; then
  postconf -e "virtual_mailbox_domains = $(norm "$WANT")"
  postfix reload
  logger -t hubify-postfix-sync "virtual_mailbox_domains updated: $(norm "$WANT")"
fi
