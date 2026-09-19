# Hubify Mail — Deploy Coolify (Opsi A Hybrid)

Repo khusus untuk deploy **Hubify Mail** (temporary email service) di **Coolify**.
Repo ini dipisah dari repo VPS-native — jangan campur alurnya.

**Web**: `https://mail.hubify.store` · **Domain email**: `@hubify.store`

---

## Daftar Isi

1. [Arsitektur](#1-arsitektur)
2. [Isi Repo](#2-isi-repo)
3. [Prasyarat](#3-prasyarat)
4. [Push Repo Baru](#4-push-repo-baru)
5. [Deploy di Coolify](#5-deploy-di-coolify)
6. [Database](#6-database)
7. [Postfix di Host (Terima Email)](#7-postfix-di-host-terima-email)
8. [DNS](#8-dns)
9. [Tes End-to-End](#9-tes-end-to-end)
10. [Referensi Environment Variable](#10-referensi-environment-variable)
11. [Operasional & Update](#11-operasional--update)
12. [Troubleshooting](#12-troubleshooting)

---

## 1. Arsitektur

```
                 HTTPS                    ┌──────────────────────────────┐
Internet ─────────────────► Coolify ────► │ web (nginx, publik)          │
                                           │   └─ /api ─► api:3000      │──► db (postgres:16)
                                           └──────────────────────────────┘

                 SMTP port 25             ┌──────────────────────────────┐
Internet ─────────────────► HOST VPS ───► │ Postfix (native, di luar     │
                                           │ Docker) ─pipe─►             │
                                           │ email-handler.js ──────────►│──► DB yang sama
                                           └──────────────────────────────┘
```

Keputusan desain (Opsi A hybrid):

| Komponen | Lokasi | Alasan |
|----------|--------|--------|
| `web` (nginx + static) | Coolify | SSL otomatis, gampang redeploy |
| `api` (Node Express) | Coolify, **1 replica** | Cron cleanup jalan in-process (`node-cron`); 1 replica menghindari konflik Telegram long-polling (error 409) |
| `db` (Postgres 16) | Coolify compose, atau Database bawaan Coolify | Bisa dua-duanya, lihat bagian 5 |
| Postfix (port 25) | **Host VPS, di luar Docker** | Coolify/Traefik hanya handle 80/443; pipe `master.cf` butuh akses root host |

Catatan: frontend memanggil API relatif (`/api`, lihat `frontend/js/unified.js`), jadi 1 domain cukup — tidak ada masalah CORS selama `CORS_ALLOWED_ORIGINS` diisi domain web.

---

## 2. Isi Repo

```
.                          ← root repo ini (build context Docker = di sini)
├── Dockerfile.api         ← image backend (Node 20-slim, healthcheck /health)
├── Dockerfile.web         ← build Vite → serve via nginx + proxy /api ke api:3000
├── docker-compose.yml     ← service api + web + db (yang dipakai Coolify)
├── nginx.conf             ← config nginx service web
├── .env.example           ← template env (JANGAN commit .env asli)
├── backend/               ← kode API (Express, pipe handler, scripts)
├── frontend/              ← kode web (Vanilla + Vite)
├── sql/
│   ├── schema.sql         ← fresh install (auto-apply saat volume db kosong)
│   ├── add-names-table.sql
│   └── migrations/001..004 ← upgrade DB lama (jalankan manual, bagian 6)
├── postfix/
│   └── setup-postfix-host.sh ← installer Postfix di HOST (bagian 7)
└── scripts/
    └── create-admin.sh    ← helper buat akun admin
```

---

## 3. Prasyarat

- [ ] VPS dengan **Coolify sudah terinstall** (min. 1 GB RAM, disarankan 2 GB)
- [ ] Provider VPS **tidak memblokir port 25 inbound** (cek ke provider; banyak cloud memblokir SMTP secara default dan harus request unblock)
- [ ] Domain + akses kelola DNS (untuk record A dan MX)
- [ ] Akses SSH root ke VPS host (untuk setup Postfix sekali saja)
- [ ] GitHub (atau GitLab) untuk menampung repo baru ini

---

## 4. Push Repo Baru

Folder ini **adalah root repo baru** — sudah berisi kode + file Docker. Dari dalam folder ini:

```bash
cd coolify
git init
git add .
git commit -m "Hubify Mail Coolify setup (opsi A hybrid)"
git branch -M main
git remote add origin https://github.com/<user>/<repo-coolify>.git
git push -u origin main
```

> Setelah ini: repo lama = alur VPS-native (`scripts/setup-vps.sh`), repo ini = alur Coolify.

Siapkan secret baru (jangan pakai ulang dari repo lama):

```bash
# Linux / Git Bash — generate 3 secret + 1 API key
openssl rand -hex 32   # → JWT_SECRET
openssl rand -hex 32   # → INBOX_ACCESS_JWT_SECRET
openssl rand -hex 32   # → INBOX_RESERVATION_IP_SALT
openssl rand -hex 24   # → API_KEY + POSTGRES_PASSWORD (bedakan keduanya)
```

---

## 5. Deploy di Coolify

1. Coolify → **Projects** → **New** → **Service** → **Docker Compose** → pilih repo baru ini.
   - Compose file: `docker-compose.yml` (ada di root repo).
   - **Build context = root repo** (Dockerfile ada di root: `Dockerfile.api`, `Dockerfile.web`).
2. Buka menu **Environment**, copy seluruh isi `.env.example`, lalu ganti semua `CHANGE_ME_*`:
   - `DATABASE_URL` default menunjuk service `db` di compose yang sama:
     `postgresql://hubify:<POSTGRES_PASSWORD>@db:5432/hubify_mail`
   - `CORS_ALLOWED_ORIGINS=https://mail.hubify.store` (tanpa trailing slash).
   - Kosongkan `TELEGRAM_*` kalau belum butuh (bot mati = aman).
3. Domain: tambahkan domain web (mis. `mail.hubify.store`) ke service **`web`**. SSL otomatis dari Coolify.
   Service `api` **jangan diexpose ke publik** — hanya diakses internal via `http://api:3000`.
4. Klik **Deploy**. Tunggu sampai `api` berstatus healthy (healthcheck `/health` tiap 30 dtk).
5. Verifikasi awal:
   - `https://<domain>/api/domains` → JSON (bukan 404).
   - `https://<domain>/admin.html` → halaman login admin.

**Dua varian database** (pilih satu):

- **A. Service `db` di compose (default, paling gampang).** Volume `pgdata` menyimpan data. Untuk akses dari host (Postfix pipe, `psql` manual), buka komentar `ports: 127.0.0.1:5432:5432` di `docker-compose.yml` lalu redeploy — hanya localhost, bukan publik.
- **B. Database bawaan Coolify (disarankan production).** Buat Postgres di Coolify, hapus service `db` dari compose, set `DATABASE_URL` ke connection string database tersebut, dan pastikan host bisa menjangkaunya (untuk Postfix pipe di bagian 7).

**Catatan scaling:** `PG_POOL_MAX=10` cukup untuk 1 replica `api`. Rumus batas koneksi: `replica × PG_POOL_MAX ≤ max_connections` Postgres (plus headroom untuk pipe Postfix). Kalau isi `TELEGRAM_BOT_TOKEN`, `api` **wajib 1 replica** (bot long-polling konflik 409 jika >1).

---

## 6. Database

- **Fresh install:** otomatis. Saat volume `pgdata` masih kosong, Postgres menjalankan `sql/schema.sql` + `sql/add-names-table.sql` sekali (mount `docker-entrypoint-initdb.d`).
- **Migrasi (DB lama / upgrade):** jalankan berurutan dari laptop/VPS (butuh akses ke DB):
  ```bash
  psql "$DATABASE_URL" -f sql/migrations/001_high_concurrency.sql
  psql "$DATABASE_URL" -f sql/migrations/002_protected_inboxes_and_domain_verification.sql
  psql "$DATABASE_URL" -f sql/migrations/003_reservation_management.sql
  psql "$DATABASE_URL" -f sql/migrations/004_protected_inbox_lifetime.sql
  ```
  Kalau DB hanya reachable dari dalam Docker, jalankan via container:
  ```bash
  docker exec -i <container-db> psql -U hubify -d hubify_mail < sql/migrations/001_high_concurrency.sql
  ```
- **Buat akun admin:**
  ```bash
  # via container api (di VPS host):
  docker exec -it <container-api> node scripts/create-admin.js ADMIN_USER ADMIN_PASS
  # atau lokal bila DATABASE_URL reachable:
  bash scripts/create-admin.sh ADMIN_USER ADMIN_PASS
  ```
  Cari nama container: `docker ps | grep -E 'api|db'`. Login di `https://<domain>/admin.html`.

---

## 7. Postfix di Host (Terima Email)

Coolify tidak mengelola port 25 — langkah ini **wajib**, tanpanya email tidak akan pernah masuk. Dijalankan **sekali** di VPS host tempat Coolify berada, sebagai root:

```bash
git clone https://github.com/<user>/<repo-coolify>.git /tmp/hubify-coolify
sudo bash /tmp/hubify-coolify/postfix/setup-postfix-host.sh
```

Script tersebut interaktif dan idempotent (aman dijalankan ulang). Isinya:

1. Install Postfix + Node.js 20.
2. Clone repo ke `/opt/hubify-mail-backend` + `npm ci --omit=dev`.
3. Menulis `/opt/hubify-mail-backend/.env` pipe (hanya `DATABASE_URL` + `MAX_EMAIL_BYTES`).
4. Set `virtual_mailbox_domains`, `virtual_transport = hubify`, dan transport pipe di `master.cf`:
   `argv=/usr/bin/node /opt/hubify-mail-backend/backend/src/handlers/email-handler.js`.
5. Buka port 25 (ufw) dan tes `SELECT FROM domains`.

> ⚠️ **Gotcha — `DATABASE_URL` untuk Postfix ≠ URL di Coolify.**
> Hostname `db` hanya dikenal di dalam jaringan Docker. Untuk script di host, pakai salah satu:
> - `postgresql://hubify:<pass>@127.0.0.1:5432/hubify_mail` (syarat: `ports: 127.0.0.1:5432:5432` di-uncomment + redeploy), atau
> - URL Database bawaan Coolify yang diexpose ke host.
>
> Tambah domain email baru → jalankan ulang script (atau edit `virtual_mailbox_domains` + `postfix reload`).

---

## 8. DNS

Set di provider domain (contoh untuk `hubify.store`):

| Type | Name | Value | Priority | Proxy |
|------|------|-------|----------|-------|
| A | mail | IP_VPS_COOLIFY | - | **OFF** (DNS-only) |
| MX | @ | mail.hubify.store | 10 | - |

- Hapus MX lama (mis. `eforward*.registrar-servers.com`) — hanya boleh 1 tujuan MX.
- SMTP tidak bisa lewat proxy Cloudflare (orange cloud) — record `mail` wajib abu-abu.
- Untuk tiap domain tambahan (5–10 domain didukung): tambah MX yang menunjuk ke host yang sama + daftarkan domain via Admin Dashboard.

---

## 9. Tes End-to-End

1. [ ] Buka `https://mail.hubify.store` → generate email → catat alamatnya.
2. [ ] Kirim email dari Gmail ke alamat itu.
3. [ ] Di host: `tail -f /var/log/mail.log` → harus ada `status=sent (delivered via hubify)`.
4. [ ] Di web: inbox muncul dalam ±5 detik (polling otomatis).
5. [ ] Di VPS: `docker logs <container-api> --tail 50` → tidak ada error koneksi DB.
6. [ ] Admin: login di `/admin.html` → statistik + daftar domain benar.
7. [ ] Cek TTL: email >24 jam terhapus otomatis oleh cron (cek keesokan harinya).

---

## 10. Referensi Environment Variable

| Var | Wajib | Default | Fungsi |
|-----|-------|---------|--------|
| `DATABASE_URL` | Ya | - | Koneksi Postgres (di compose: `...@db:5432/...`) |
| `POSTGRES_PASSWORD` | Ya | - | Password service `db` |
| `POSTGRES_DB` / `POSTGRES_USER` | Tidak | `hubify_mail` / `hubify` | Nama DB & user service `db` |
| `JWT_SECRET` | Ya | - | JWT admin |
| `INBOX_ACCESS_JWT_SECRET` | Ya | - | Token inbox terproteksi |
| `INBOX_RESERVATION_IP_SALT` | Ya | - | Salt hash IP reservasi |
| `API_KEY` | Ya | - | Kunci `/api/ext/*` (bulk OTP) |
| `CORS_ALLOWED_ORIGINS` | Ya | - | Domain web, koma-dipisah, tanpa trailing slash |
| `MAIL_SERVER_HOSTNAME` | Tidak | `mail.hubify.store` | Hostname mail |
| `RATE_LIMIT_WINDOW_MS` / `RATE_LIMIT_MAX_REQUESTS` | Tidak | `60000` / `60` | Limit publik per IP |
| `API_RATE_LIMIT_MAX` | Tidak | `5000` | Limit `/api/ext` per API key per menit |
| `MAX_EMAIL_BYTES` | Tidak | `1048576` (1 MB) | Email lebih besar di-drop graceful |
| `INBOX_LIST_LIMIT` | Tidak | `20` | Jumlah email per response list |
| `PG_POOL_MAX` | Tidak | `10` | Koneksi pool per container `api` |
| `PG_IDLE_TIMEOUT_MS` / `PG_CONNECTION_TIMEOUT_MS` | Tidak | `30000` / `10000` | Tuning pool |
| `PUBLIC_RESERVATION_MAX_PER_IP` / `PUBLIC_RESERVATION_TTL_DAYS` | Tidak | `5` / `7` | Kuota & masa inbox terproteksi publik |
| `INBOX_ACCESS_TOKEN_TTL` / `INBOX_UNLOCK_*` | Tidak | `15m` / `5` / `60000` | Token & rate-limit unlock inbox |
| `TELEGRAM_BOT_TOKEN` / `TELEGRAM_OWNER_ID` / `TELEGRAM_CHANNEL_ID` | Tidak | kosong (mati) | Bot Telegram; jika diisi → `api` wajib 1 replica |

---

## 11. Operasional & Update

**Sync dari repo lama** (sumber kode = repo VPS-native; jangan edit kode di dua tempat):

```powershell
# Dari root repo LAMA (Windows):
robocopy "backend"  "coolify\backend"  /E /XD node_modules
robocopy "frontend" "coolify\frontend" /E /XD node_modules dist
robocopy "sql"      "coolify\sql"      /E
```

lalu dari folder `coolify/`: commit → push → **Redeploy di Coolify** → jalankan migrasi baru bila ada file baru di `sql/migrations/`.

**Perintah Tomorrow sehari-hari (di VPS host):**

```bash
docker ps | grep -E 'api|web|db'     # cari nama container (prefix acak dari Coolify)
docker logs <container-api> --tail 100
docker exec -it <container-db> psql -U hubify -d hubify_mail -c "SELECT count(*) FROM emails;"
tail -f /var/log/mail.log            # log SMTP masuk (host)
```

**Backup:** jangan lupa backup volume `pgdata` (atau backup terjadwal Database Coolify bila pakai varian B) sebelum redeploy besar / hapus service.

---

## 12. Troubleshooting

| Gejala | Penyebab umum | Perbaikan |
|--------|---------------|-----------|
| `api` unhealthy / `ECONNREFUSED db:5432` | `DATABASE_URL` salah, password beda dengan `POSTGRES_PASSWORD`, atau `db` belum healthy | Samakan password, cek `depends_on` + log `db`; tes `pg_isready` via `docker exec` |
| `/api/domains` 404 di domain | Domain menunjuk ke service yang salah / proxy `/api` gagal | Domain harus ke service `web`; cek log `web` & `api` |
| `CORS / Origin not allowed` | `CORS_ALLOWED_ORIGINS` tidak sama persis dengan URL web | Isi tanpa trailing slash, koma-dipisah bila multi-domain |
| Email tidak masuk, `mail.log` kosong | MX/DNS salah, port 25 diblokir provider, atau firewall | `dig MX <domain>`, `telnet <ip> 25`, `ufw allow 25/tcp`; konfirmasi unblock SMTP ke provider |
| `status=deferred (pipe)` di `mail.log` | Pipe handler crash / `.env` pipe salah / DB unreachable dari host | `cat /opt/hubify-mail-backend/.env`; tes `psql "$DATABASE_URL" -c "SELECT 1"`; cek `journalctl -u postfix` |
| Telegram error 409 `getUpdates conflict` | `api` >1 replica dengan bot aktif | Scale ke 1 replica, atau kosongkan `TELEGRAM_BOT_TOKEN` |
| Tabel tidak ada (`relation domains does not exist`) | Volume `db` lama + kode baru, atau init gagal | Jalankan `sql/schema.sql` + migrasi manual (bagian 6) |
| Build `web` gagal | `frontend/dist` ikut ke-copy / cache | Pastikan `.dockerignore` ada `frontend/dist`; rebuild tanpa cache di Coolify |

Butuh konteks repo lama (Postfix detail, panduan domain, API eksternal): lihat `docs/vps-setup.md`, `docs/domain-guide.md`, `docs/api-external.md` di repo VPS-native.
