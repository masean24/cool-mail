#!/usr/bin/env bash
# Buat user admin di DB Coolify — jalankan dari root repo baru ini.
# Cara 1 (lewat container api Coolify, via SSH ke VPS):
#   docker exec -it <nama-container-api> node scripts/create-admin.js ADMIN_USER ADMIN_PASS
# Cara 2 (lokal, butuh DATABASE_URL):
#   DATABASE_URL=postgresql://... bash coolify/scripts/create-admin.sh ADMIN_USER ADMIN_PASS
set -Eeuo pipefail
USER="${1:-}"; PASS="${2:-}"
[ -n "$USER" ] && [ -n "$PASS" ] || { echo "Pakai: bash coolify/scripts/create-admin.sh <username> <password>"; exit 1; }
(cd backend && node scripts/create-admin.js "$USER" "$PASS")
