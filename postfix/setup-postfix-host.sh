#!/usr/bin/env bash
#
# Hubify Mail — Postfix di HOST untuk arsitektur Coolify Opsi A (hybrid)
#
# Konsep: Coolify (Docker) menjalankan web + api + db.
# Postfix berjalan di HOST VPS (bukan di container), port 25,
# lalu pipe email masuk ke email-handler.js yang insert langsung
# ke Postgres yang sama (DATABASE_URL Coolify).
#
# Jalankan SEKALI di VPS host tempat Coolify terinstall, sebagai root:
#   sudo bash postfix/setup-postfix-host.sh
#
# Script ini interaktif: minta DATABASE_URL (dari Coolify), hostname mail,
# dan daftar domain email. Aman dijalankan ulang (idempotent).
#
set -Eeuo pipefail

log()  { printf '\n\033[1;32m==>\033[0m %s\n' "$*"; }
warn() { printf '\n\033[1;33mWARN:\033[0m %s\n' "$*" >&2; }
die()  { printf '\n\033[1;31mERROR:\033[0m %s\n' "$*" >&2; exit 1; }

[ "${EUID:-$(id -u)}" -eq 0 ] || die "Jalankan sebagai root: sudo bash postfix/setup-postfix-host.sh"

prompt() { local l="$1" d="${2:-}" v; if [ -n "$d" ]; then read -r -p "$l [$d]: " v; printf '%s' "${v:-$d}"; else read -r -p "$l: " v; printf '%s' "$v"; fi; }

log "1/6 Instalasi paket (postfix, nodejs 20)..."
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get install -y curl git postgresql-client postfix
if ! command -v node >/dev/null 2>&1; then
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y nodejs
fi
node --version

log "2/6 Konfigurasi backend pipe di /opt/hubify-mail-backend..."
BACKEND_DIR="/opt/hubify-mail-backend"
mkdir -p "$BACKEND_DIR"
# CATATAN: ganti REPO_URL di bawah dengan URL repo Coolify BARU kamu.
REPO_URL="$(prompt 'URL repo Coolify baru (untuk ambil email-handler)' '')"
if [ -n "$REPO_URL" ]; then
  if [ -d "$BACKEND_DIR/.git" ]; then
    git -C "$BACKEND_DIR" pull --ff-only || warn "git pull gagal, pakai kode yang ada."
  else
    rm -rf "${BACKEND_DIR:?}/"* 2>/dev/null || true
    git clone --depth 1 "$REPO_URL" "$BACKEND_DIR.tmp" && rm -rf "$BACKEND_DIR" && mv "$BACKEND_DIR.tmp" "$BACKEND_DIR"
  fi
  (cd "$BACKEND_DIR/backend" && npm ci --omit=dev)
else
  warn "REPO_URL kosong — lewati clone. Pastikan $BACKEND_DIR/backend/src/handlers/email-handler.js sudah ada (copy manual)."
fi

DATABASE_URL="$(prompt 'DATABASE_URL (SAMAKAN dengan env Coolify api, host db:/ganti IP container atau pakai IP host)' '')"
[ -n "$DATABASE_URL" ] || die "DATABASE_URL wajib diisi."
MAX_EMAIL_BYTES="$(prompt 'MAX_EMAIL_BYTES' '1048576')"
MAIL_HOST="$(prompt 'Mail hostname (A record web/mail)' 'mail.hubify.store')"
DOMAINS_CSV="$(prompt 'Daftar domain email (koma, cth: hubify.store)' 'hubify.store')"

# PENTING: email-handler.js membaca backend/.env (bukan root .env).
cat > "$BACKEND_DIR/backend/.env" <<EOF
# Dipakai HANYA oleh email-handler.js (Postfix pipe). Jangan taruh secret lain.
DATABASE_URL=$DATABASE_URL
MAX_EMAIL_BYTES=$MAX_EMAIL_BYTES
NOTIFY_TIMEOUT_MS=3000
EOF
# Salinan di root dipakai watcher cron (postfix/sync-domains-watcher.sh).
cp "$BACKEND_DIR/backend/.env" "$BACKEND_DIR/.env"
chmod 640 "$BACKEND_DIR/backend/.env" "$BACKEND_DIR/.env"
# User postfix pipe = www-data (lihat master.cf di bawah). Kalau user lain, sesuaikan.
id www-data >/dev/null 2>&1 || useradd -r -s /usr/sbin/nologin www-data || true
chown -R www-data:www-data "$BACKEND_DIR" 2>/dev/null || chown -R root:root "$BACKEND_DIR"
chmod 640 "$BACKEND_DIR/.env"

log "3/6 Konfigurasi Postfix (main.cf + master.cf)..."
# Backup sekali
[ -f /etc/postfix/main.cf.bak.hubify ] || cp /etc/postfix/main.cf /etc/postfix/main.cf.bak.hubify
[ -f /etc/postfix/master.cf.bak.hubify ] || cp /etc/postfix/master.cf /etc/postfix/master.cf.bak.hubify

postconf -e "myhostname = $MAIL_HOST"
# mydomain TIDAK boleh mereferensikan dirinya sendiri ($mydomain = $mydomain
# = fatal macro nesting). Pakai domain email pertama sebagai identitas lokal.
# (Server ini tidak pernah kirim email, jadi nilai ini hanya formalitas.)
FIRST_DOMAIN="$(printf '%s' "$DOMAINS_CSV" | cut -d, -f1 | tr -d ' ')"
postconf -e "mydomain = $FIRST_DOMAIN"
postconf -e 'myorigin = $mydomain'
postconf -e 'mydestination = localhost'
# Domain virtual dipisah koma -> spasi untuk postfix
VIRTUAL_DOMAINS="$(printf '%s' "$DOMAINS_CSV" | tr ',' ' ')"
postconf -e "virtual_mailbox_domains = $VIRTUAL_DOMAINS"
postconf -e 'virtual_transport = hubify'
postconf -e 'smtpd_recipient_restrictions = permit_mynetworks, reject_unauth_destination'
# Batas ukuran biar selaras dengan MAX_EMAIL_BYTES (tambah headroom header)
postconf -e 'message_size_limit = 2048000'

if ! grep -q 'hubify .* pipe' /etc/postfix/master.cf; then
cat >> /etc/postfix/master.cf <<EOF

hubify unix - n n - - pipe
  flags=F user=www-data argv=/usr/bin/node $BACKEND_DIR/backend/src/handlers/email-handler.js
EOF
else
  warn "Transport 'hubify' sudah ada di master.cf — lewati (cek manual bila path backend berubah)."
fi

postfix check
systemctl enable --now postfix
postfix reload

log "4/6 Firewall: buka port 25..."
if command -v ufw >/dev/null 2>&1; then
  ufw allow 25/tcp || true
  ufw allow 80/tcp || true
  ufw allow 443/tcp || true
fi

log "5/6 Pasang watcher sinkronisasi domain (cron tiap 2 menit)..."
# Watcher menyamakan virtual_mailbox_domains dengan domain aktif di DB,
# sehingga tambah domain cukup dari Admin Dashboard. Idempotent.
WATCHER="$BACKEND_DIR/postfix/sync-domains-watcher.sh"
if [ -f "$WATCHER" ]; then
  chmod +x "$WATCHER"
  (crontab -l 2>/dev/null | grep -v 'sync-domains-watcher.sh'; echo "*/2 * * * * /bin/bash $WATCHER >> /var/log/hubify-postfix-sync.log 2>&1") | crontab -
  log "Watcher terpasang. Cek: crontab -l | grep watcher"
else
  warn "Watcher tidak ditemukan di $WATCHER (repo belum di-pull?). Tambah domain masih harus edit Postfix manual."
fi

log "6/6 Tes koneksi DB dari host..."
if sudo -u www-data psql "$DATABASE_URL" -c "SELECT count(*) FROM domains;" 2>/dev/null \
   || psql "$DATABASE_URL" -c "SELECT count(*) FROM domains;"; then
  log "Koneksi DB OK + tabel domains ada."
else
  warn "Koneksi DB GAGAL atau tabel belum ada. Pastikan DB Coolify running dan schema.sql sudah di-apply."
fi

echo
log "SELESAI. Checklist DNS (di provider domain):"
echo "  A  : mail -> IP VPS ini (proxy OFF kalau pakai Cloudflare)"
echo "  MX : @ -> $MAIL_HOST (priority 10), hapus MX lama"
echo "Kirim email tes ke test@$(printf '%s' "$DOMAINS_CSV" | cut -d, -f1 | tr -d ' ') lalu cek log: tail -f /var/log/mail.log"
echo "Service Coolify tetap yang serve web/api. Host ini HANYA untuk terima email."
