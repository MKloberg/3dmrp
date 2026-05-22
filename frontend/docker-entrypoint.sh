#!/bin/sh
# Generate a self-signed TLS cert with correct SANs on first run only.
# The cert lives in a Docker volume so it persists across container restarts;
# phones only need to accept the self-signed warning once.

CERT=/etc/nginx/ssl/cert.crt
KEY=/etc/nginx/ssl/cert.key

mkdir -p /etc/nginx/ssl

# Skip generation if cert already exists (persisted in volume)
if [ -f "$KEY" ] && [ -f "$CERT" ]; then
  exit 0
fi

SANS="DNS:localhost,IP:127.0.0.1"

# Add all IPs reported for host.docker.internal (IPv4 and IPv6)
for ip in $(getent ahosts host.docker.internal 2>/dev/null | awk '!seen[$1]++ { print $1 }'); do
  SANS="$SANS,IP:$ip"
done

# Best-effort: ask the backend for the actual Windows LAN IP (the phone connects to this)
BACKEND_IP=$(wget -qO- --timeout=5 "http://host.docker.internal:8000/api/settings/lan-ip" 2>/dev/null \
  | sed -n 's/.*"ip":"\([^"]*\)".*/\1/p')
if [ -n "$BACKEND_IP" ]; then
  case "$SANS" in
    *"IP:$BACKEND_IP"*) ;;
    *) SANS="$SANS,IP:$BACKEND_IP" ;;
  esac
fi

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout "$KEY" \
  -out "$CERT" \
  -subj "/CN=3dmrp-local" \
  -addext "subjectAltName=$SANS" \
  2>/dev/null
