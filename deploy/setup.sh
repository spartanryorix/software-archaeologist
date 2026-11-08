#!/usr/bin/env bash
# One-shot deploy on the Vultr VM (run as the `deploy` user from the project root:  bash deploy/setup.sh)
set -euo pipefail
cd "$(dirname "$0")/.."

IP="$(hostname -I | awk '{print $1}')"
HOST="${1:-${IP//./-}.sslip.io}"
echo "==> Deploying to https://${HOST}"

[ -f "$HOME/.vkey" ] || { echo "!! Missing ~/.vkey (your Vultr Inference key). Create it first:  read -rs -p 'Vultr key: ' K; echo \"\$K\" > ~/.vkey; chmod 600 ~/.vkey"; exit 1; }
docker info >/dev/null 2>&1 || { echo "!! Docker is not usable by this user (log out/in after joining the docker group)."; exit 1; }

echo "==> Building the frontend"
npm install --no-audit --no-fund
npm run build
sudo mkdir -p /var/www/app
sudo rm -rf /var/www/app/*
sudo cp -r dist/. /var/www/app/

echo "==> Installing the backend"
(cd server && npm install --omit=dev --no-audit --no-fund)
command -v pm2 >/dev/null || sudo npm install -g pm2
pm2 delete archaeologist-api >/dev/null 2>&1 || true
pm2 start deploy/ecosystem.config.cjs
pm2 save
sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" >/dev/null 2>&1 || true

echo "==> Configuring Caddy (automatic HTTPS)"
sed "s/__HOST__/${HOST}/" deploy/Caddyfile.template | sudo tee /etc/caddy/Caddyfile >/dev/null
sudo systemctl reload caddy || sudo systemctl restart caddy

echo "==> Pre-pulling sandbox images (first run is much faster)"
docker pull alpine:3.20 || true
docker pull python:2.7 || true

sleep 2
echo "==> Health check:"
curl -s "http://127.0.0.1:3001/api/health"; echo
echo "Done. Open https://${HOST}  (HTTPS certificate can take ~30 s the first time)."
