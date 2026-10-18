#!/usr/bin/env bash
# Sets up (or updates) the store on an Ubuntu 22.04 / 24.04 server with Docker Compose + Caddy.
#
#   First run:
#     sudo ADMIN_PHONES=9876543210 \
#          TWILIO_ACCOUNT_SID=AC... TWILIO_AUTH_TOKEN=... TWILIO_VERIFY_SERVICE_SID=VA... \
#          STORE_NAME="My Store" STORE_SUPPORT_EMAIL=... STORE_SUPPORT_PHONE=... WHATSAPP_NUMBER=91... \
#          bash setup.sh example.com
#   (the STORE_* / WHATSAPP_NUMBER values are optional starting values for Admin -> Settings)
#
#   Later (pull the latest code and rebuild):  sudo bash /opt/shop/deploy/setup.sh example.com
#
# The Twilio values let the owner receive a login code on the first visit (production refuses the
# "console" OTP provider). Everything else (store details, payments, email, SMS, WhatsApp) is
# entered in Admin -> Settings afterwards. Re-running keeps existing secrets and data.
set -euo pipefail

DOMAIN="${1:?Usage: sudo ADMIN_PHONES=<mobile> bash setup.sh <domain> [git-repo-url]}"
REPO="${2:-https://github.com/Tamilselvanbca/e-commerce.git}"
BRANCH="${BRANCH:-main}"
APP_DIR="${APP_DIR:-/opt/shop}"
COMPOSE=(docker compose -f docker-compose.prod.yml)

[ "$(id -u)" -eq 0 ] || { echo "Please run as root (sudo)." >&2; exit 1; }
log() { printf '\n\033[1;33m==> %s\033[0m\n' "$*"; }
rand() { openssl rand -hex 32; }

log "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
apt-get update -qq
apt-get install -y -qq git curl ca-certificates openssl ufw cron >/dev/null
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh >/dev/null
fi
systemctl enable --now docker >/dev/null 2>&1

# The Next.js build needs about 2 GB of memory; give small servers some swap.
mem_mb=$(awk '/MemTotal/ {print int($2 / 1024)}' /proc/meminfo)
if [ "$mem_mb" -lt 3500 ] && [ -z "$(swapon --show --noheadings)" ]; then
  log "Adding 2 GB of swap (server has ${mem_mb} MB RAM)"
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile >/dev/null
  swapon /swapfile
  grep -q '^/swapfile ' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

log "Firewall: allowing SSH, HTTP and HTTPS"
ufw allow OpenSSH >/dev/null
ufw allow 80/tcp >/dev/null
ufw allow 443 >/dev/null
ufw --force enable >/dev/null

log "Fetching the code into $APP_DIR"
if [ -d "$APP_DIR/.git" ]; then
  git -C "$APP_DIR" pull -q --ff-only origin "$BRANCH"
else
  git clone -q --branch "$BRANCH" "$REPO" "$APP_DIR"
fi
cd "$APP_DIR"

umask 077
if [ ! -f .env ]; then
  log "Creating .env (domain and database password)"
  printf 'DOMAIN=%s\nPOSTGRES_PASSWORD=%s\n' "$DOMAIN" "$(rand)" > .env
else
  sed -i "s/^DOMAIN=.*/DOMAIN=${DOMAIN}/" .env
fi

if [ ! -f backend/.env.production ]; then
  : "${ADMIN_PHONES:?Set ADMIN_PHONES=<owner mobile number> on the first run}"
  provider="${OTP_PROVIDER:-twilio_verify}"
  if [ "$provider" = "twilio_verify" ] && { [ -z "${TWILIO_ACCOUNT_SID:-}" ] || [ -z "${TWILIO_AUTH_TOKEN:-}" ] || [ -z "${TWILIO_VERIFY_SERVICE_SID:-}" ]; }; then
    echo "Twilio Verify needs TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN and TWILIO_VERIFY_SERVICE_SID on the first run." >&2
    exit 1
  fi
  log "Creating backend/.env.production"
  cat > backend/.env.production <<EOF
# Server settings only. Store details, delivery, payments, email, SMS, storage and WhatsApp
# are managed in Admin -> Settings (saved in the database, secrets encrypted).
NODE_ENV=production
LOG_LEVEL=info
CURRENCY=INR
OTP_SECRET=$(rand)
# Encrypts the secrets saved in Admin -> Settings. Keep a copy somewhere safe.
SETTINGS_ENCRYPTION_KEY=$(rand)
ADMIN_PHONES=${ADMIN_PHONES}
OTP_EXPOSE_IN_RESPONSE=false
ENABLE_MOCK_PAYMENTS=false
UPLOAD_DIR=uploads

# Login codes for the first admin login (can be changed later in Admin -> Settings).
OTP_PROVIDER=${provider}
TWILIO_ACCOUNT_SID=${TWILIO_ACCOUNT_SID:-}
TWILIO_AUTH_TOKEN=${TWILIO_AUTH_TOKEN:-}
TWILIO_VERIFY_SERVICE_SID=${TWILIO_VERIFY_SERVICE_SID:-}
TWILIO_VERIFY_TEMPLATE_SID=${TWILIO_VERIFY_TEMPLATE_SID:-}
EOF
  # Optional starting values; Admin -> Settings overrides them later.
  for name in STORE_NAME STORE_SUPPORT_EMAIL STORE_SUPPORT_PHONE WHATSAPP_NUMBER; do
    if [ -n "${!name:-}" ]; then printf '%s=%s\n' "$name" "${!name}" >> backend/.env.production; fi
  done
fi
umask 022

log "Building and starting the store (the first build takes several minutes)"
"${COMPOSE[@]}" up -d --build --remove-orphans

log "Waiting for the API"
for _ in $(seq 1 60); do
  if "${COMPOSE[@]}" exec -T backend wget -qO- http://127.0.0.1:4000/api/health >/dev/null 2>&1; then
    healthy=1
    break
  fi
  sleep 3
done
if [ -z "${healthy:-}" ]; then
  echo "The API did not become healthy. Recent logs:" >&2
  "${COMPOSE[@]}" logs --tail 40 backend >&2
  exit 1
fi

products=$("${COMPOSE[@]}" exec -T postgres psql -U shop -d shop -tAc 'SELECT count(*) FROM products' | tr -d '[:space:]')
if [ "$products" = "0" ] && [ "${SEED:-yes}" = "yes" ]; then
  log "Adding the starter catalogue (edit or replace it in Admin -> Products)"
  "${COMPOSE[@]}" exec -T backend node src/db/seed.js
fi

log "Scheduling daily backups to /var/backups/shop (kept 14 days)"
mkdir -p /var/backups/shop
cat > /etc/cron.d/shop-backup <<EOF
# Daily database and image backups for the store.
30 2 * * * root cd ${APP_DIR} && docker compose -f docker-compose.prod.yml exec -T postgres pg_dump -U shop shop | gzip > /var/backups/shop/db-\$(date +\%F).sql.gz
45 2 * * * root docker run --rm -v shop_uploads:/u:ro -v /var/backups/shop:/b alpine tar czf /b/uploads-\$(date +\%F).tgz -C /u .
0 3 * * * root find /var/backups/shop -type f -mtime +14 -delete
EOF
chmod 644 /etc/cron.d/shop-backup
docker image prune -f >/dev/null

ip=$(curl -fsS https://api.ipify.org || hostname -I | awk '{print $1}')
cat <<EOF

Done. The store runs in ${APP_DIR}.

  1. DNS: point an A record for ${DOMAIN} (and www) to ${ip}. HTTPS starts automatically once it resolves.
  2. Open https://${DOMAIN}/login and sign in with ${ADMIN_PHONES:-an ADMIN_PHONES number}.
  3. Admin -> Settings: store details, Razorpay/Stripe keys, email, order SMS and WhatsApp.
  4. Back up ${APP_DIR}/.env and ${APP_DIR}/backend/.env.production somewhere safe.

Logs:    cd ${APP_DIR} && docker compose -f docker-compose.prod.yml logs -f backend
Update:  sudo bash ${APP_DIR}/deploy/setup.sh ${DOMAIN}
EOF
