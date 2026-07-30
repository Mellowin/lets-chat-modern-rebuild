# B237 Production Runbook

This document describes how to deploy the Lets Chat API stack to a Hetzner VPS
using Docker Compose, Caddy, Cloudflare R2 and Resend. It is part of **B237A —
Production Foundation and Hardening**; it does not itself create any external
resources.

## Target architecture

| Layer | Service | Runtime |
|---|---|---|
| Frontend | Next.js | Vercel |
| Reverse proxy / TLS | Caddy 2 | Docker Compose on VPS |
| API | NestJS + Socket.io | Docker Compose on VPS |
| Database | PostgreSQL 15 | Docker Compose on VPS |
| Cache / pub-sub | Redis 7 | Docker Compose on VPS |
| Object storage | Cloudflare R2 | External |
| Transactional email | Resend | External |

## 1. VPS provisioning

Recommended instance for the first public beta:

- **Provider:** Hetzner Cloud
- **Server type:** CX23 (2 shared vCPU, 4 GB RAM, 40 GB SSD)
- **Price:** €5.49/month for the server (excl. VAT and IPv4) as of June 2026
  ([Hetzner price adjustment](https://docs.hetzner.com/general/infrastructure-and-availability/price-adjustment/))
- **Region:** Falkenstein (FSN) or Helsinki (HEL) for EU/GDPR proximity
- **OS:** Ubuntu 24.04 LTS
- **Primary IPv4:** add a public IPv4 address if you need direct DNS A records
  (~€0.50/month)

Hard requirements for the host:

- Docker Engine 24.x or newer
- Docker Compose plugin (`docker compose`)
- `git` and an SSH key authorized on GitHub

## 2. Initial server hardening

Perform these steps once after creating the server. Exact commands are shown as
examples — adapt hostnames and users as needed.

### Create a non-root deploy user

```bash
sudo adduser deploy
sudo usermod -aG docker deploy
sudo mkdir -p /home/deploy/.ssh
sudo cp ~/.ssh/authorized_keys /home/deploy/.ssh/authorized_keys
sudo chown -R deploy:deploy /home/deploy/.ssh
sudo chmod 700 /home/deploy/.ssh
sudo chmod 600 /home/deploy/.ssh/authorized_keys
```

### SSH lockdown

Edit `/etc/ssh/sshd_config` (or a drop-in file):

```text
PermitRootLogin no
PasswordAuthentication no
PubkeyAuthentication yes
AllowUsers deploy
```

Reload SSH:

```bash
sudo systemctl restart sshd
```

### Firewall

Open only the ports that must be reachable from the internet:

```bash
sudo ufw default deny incoming
sudo ufw default allow outgoing
sudo ufw allow 22/tcp comment 'SSH from trusted IP only'
sudo ufw allow 80/tcp comment 'HTTP for ACME challenges'
sudo ufw allow 443/tcp comment 'HTTPS traffic'
sudo ufw enable
```

If your IP is static, restrict port 22 further:

```bash
sudo ufw delete allow 22/tcp
sudo ufw allow from YOUR_TRUSTED_IP to any port 22 proto tcp
```

### Hetzner Cloud firewall (additional layer)

Create a Hetzner Cloud firewall in the console and attach it to the server:

- Inbound: TCP 22 from trusted IP, TCP 80 from anywhere, TCP 443 from anywhere
- Outbound: allow all

## 3. DNS

Point the production domain at the server:

| Record | Type | Value |
|---|---|---|
| `api.example.com` | A | VPS IPv4 address |
| `api.example.com` | AAAA | VPS IPv6 address (optional) |

Set `API_DOMAIN=api.example.com` in `.env.production`.

## 4. External services

### Cloudflare R2

1. Create a private R2 bucket, e.g. `letschat-uploads`.
2. Create an R2 API token with **Object Read & Write** permission for that bucket.
3. Note the S3 endpoint, access key ID and secret access key.
4. Set the corresponding `S3_*` values in `.env.production`.

R2 pricing (July 2026):

- 10 GB storage included, then $0.015/GB-month
- Free egress
- 1 million Class A and 10 million Class B operations included monthly
  ([R2 Pricing](https://developers.cloudflare.com/r2/pricing/))

### Resend

1. Sign up at Resend and verify the production sending domain.
2. Create an API key.
3. Set `MAIL_PROVIDER=resend`, `RESEND_API_KEY`, and `MAIL_FROM` in
   `.env.production`.

Resend pricing (July 2026):

- Free: 3,000 emails/month (100/day)
- Pro: $20/month for 50,000 emails
  ([Resend Pricing](https://resend.com/pricing?product=transactional))

### Vercel

1. Import the `apps/web` project into Vercel.
2. Set production environment variables:
   - `NEXT_PUBLIC_API_URL=https://api.example.com/api/v1`
   - `NEXT_PUBLIC_WS_URL=https://api.example.com`
3. Deploy.

Note: Vercel Hobby is free for personal, non-commercial projects. Commercial use
requires a Pro plan.

## 5. Environment file

Copy the example file and fill in real values:

```bash
cp .env.production.example .env.production
chmod 600 .env.production
```

Never commit `.env.production`. It is listed in `.gitignore`.

Required secrets and values:

- `DATABASE_URL` — must point to the `postgres` service inside Compose
- `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB`
- `REDIS_URL` — must point to the `redis` service inside Compose
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET` — generate with `openssl rand -hex 32`
- `S3_ENDPOINT`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, `S3_BUCKET`
- `CORS_ORIGIN` — the Vercel production domain and any custom domains
- `APP_WEB_URL` — must be `https://...`
- `MAIL_PROVIDER`, `MAIL_FROM`, `RESEND_API_KEY`
- `API_DOMAIN` — same as the DNS A record

## 6. First deploy

On the VPS as the `deploy` user:

```bash
git clone git@github.com:Mellowin/lets-chat-modern-rebuild.git
cd lets-chat-modern-rebuild
cp /path/to/.env.production .env.production
```

Pull the desired image (or build on the server):

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
```

Apply migrations **before** the new API version serves traffic. This example
runs migrations from a local checkout:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production run --rm \
  -e DATABASE_URL="$DATABASE_URL" \
  api sh -c 'pnpm --filter @lets-chat/database migrate:deploy'
```

Wait for health:

```bash
curl -fsS https://api.example.com/api/v1/health/live
curl -fsS https://api.example.com/api/v1/health/ready
```

## 7. Rollback

If a deploy is unhealthy:

```bash
# Revert to the previous image tag
docker compose -f docker-compose.prod.yml --env-file .env.production down
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --no-deps api
```

For database rollbacks, restore from a verified backup (see section 9).

## 8. Backups

Run the backup script manually or from a systemd timer:

```bash
ENV_FILE=.env.production ./scripts/production/backup-postgres.sh
```

The script:

- creates a `pg_dump` custom-format archive,
- computes a SHA-256 checksum,
- uploads both to `s3://<bucket>/backups/postgres/`,
- keeps the most recent `RETENTION_COUNT` backups.

Systemd timer example (`/etc/systemd/system/letschat-backup.timer`):

```ini
[Unit]
Description=Daily Lets Chat database backup

[Timer]
OnCalendar=daily
Persistent=true

[Install]
WantedBy=timers.target
```

And the service (`/etc/systemd/system/letschat-backup.service`):

```ini
[Unit]
Description=Backup Lets Chat PostgreSQL to R2

[Service]
Type=oneshot
User=deploy
WorkingDirectory=/home/deploy/lets-chat-modern-rebuild
Environment=ENV_FILE=/home/deploy/lets-chat-modern-rebuild/.env.production
ExecStart=/home/deploy/lets-chat-modern-rebuild/scripts/production/backup-postgres.sh
```

## 9. Restore drill

To verify a backup without touching production:

1. Create a separate verification database.
2. Download and verify the backup:

```bash
./scripts/production/verify-backup.sh s3://<bucket>/backups/postgres/TIMESTAMP_db.dump
```

3. Restore into the verification database:

```bash
RESTORE_TARGET_DATABASE_URL='postgresql://user:pass@host:5432/verification_db' \
  ./scripts/production/restore-postgres.sh s3://<bucket>/backups/postgres/TIMESTAMP_db.dump
```

To restore into the production database, pass `--acknowledge-destructive` and
type the target database name when prompted. This causes downtime and data loss
on the target database.

## 10. Orphan attachment cleanup

The existing script `apps/api/scripts/cleanup-orphaned-attachments.mjs` is
production-compatible with R2.

Dry-run:

```bash
node apps/api/scripts/cleanup-orphaned-attachments.mjs
```

Actually delete objects older than 24 hours that have no matching database row:

```bash
node apps/api/scripts/cleanup-orphaned-attachments.mjs --delete
```

Run from a systemd timer, never at the same time as a backup. The script
operates only on the `attachments/` and `forwarded/` prefixes and never prints
credentials.

## 11. Monitoring and alerts

Minimal free monitoring stack:

- **Uptime:** UptimeRobot free tier (5-minute checks) or a self-hosted cron job
  that curls `/api/v1/health/ready`.
- **Logs:** `docker compose logs -f api` or forward to a log aggregator.
- **Alerts:** Use UptimeRobot webhook/email or a simple script that opens a
  GitHub issue / sends email when `/api/v1/health/ready` returns non-200 for more
  than a few minutes.

## 12. Security maintenance

- Keep the host OS and Docker packages updated (`unattended-upgrades` on
  Ubuntu).
- Rotate `JWT_ACCESS_SECRET` and `JWT_REFRESH_SECRET` by generating new keys and
  redeploying. Existing sessions will be invalidated.
- Rotate R2 and Resend API keys periodically.
- Review `docker compose logs` for abuse patterns.
- Keep `.env.production` permissions at `600`.

## 13. Limitations and next steps

- A single VPS is a single point of failure. This setup is intended for the
  first public beta, not high-availability production.
- Database backups rely on self-managed `pg_dump` to R2. For stricter RPO,
  consider managed PostgreSQL in the future.
- The Resend free plan has a 100 emails/day limit. Monitor bounce/complaint
  rates before scaling.
- Commercial use of Vercel requires a paid plan.
