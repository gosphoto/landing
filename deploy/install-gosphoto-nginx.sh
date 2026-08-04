#!/usr/bin/env bash
set -euo pipefail

DEPLOY_PATH="${DEPLOY_PATH:-/opt/gosphoto-landing}"
CERTBOT_EMAIL="${CERTBOT_EMAIL:-admin@gosphoto.ru}"
SITE_HOST="${SITE_HOST:-gosphoto.ru}"
WEB_ROOT="${WEB_ROOT:-/var/www/gosphoto.ru}"
SITE="/etc/nginx/sites-available/${SITE_HOST}"

mkdir -p /var/www/certbot "${WEB_ROOT}"

if [[ -f "/etc/letsencrypt/live/${SITE_HOST}/fullchain.pem" ]]; then
  cp "${DEPLOY_PATH}/gosphoto.ru.nginx.conf" "${SITE}"
else
  cp "${DEPLOY_PATH}/gosphoto.ru.nginx.http.conf" "${SITE}"
fi

ln -sf "${SITE}" "/etc/nginx/sites-enabled/${SITE_HOST}"
nginx -t
systemctl reload nginx

if [[ ! -f "/etc/letsencrypt/live/${SITE_HOST}/fullchain.pem" ]]; then
  if certbot certonly --webroot -w /var/www/certbot \
    -d "${SITE_HOST}" \
    -d "www.${SITE_HOST}" \
    --non-interactive --agree-tos --email "${CERTBOT_EMAIL}"; then
    cp "${DEPLOY_PATH}/gosphoto.ru.nginx.conf" "${SITE}"
    nginx -t
    systemctl reload nginx
  else
    echo "certbot skipped for ${SITE_HOST}: add DNS A records for apex+www, then re-run deploy"
  fi
fi

echo "OK: https://${SITE_HOST}/"
