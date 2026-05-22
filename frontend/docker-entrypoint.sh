#!/bin/sh
# Generate self-signed cert with SANs at startup so the host LAN IP is included.
# Browsers (Chrome 58+) require SAN; a CN-only cert gives ERR_SSL_PROTOCOL_ERROR.
HOST_IP=$(getent hosts host.docker.internal 2>/dev/null | awk '{ print $1 }')
SANS="DNS:localhost,IP:127.0.0.1"
if [ -n "$HOST_IP" ]; then
  SANS="$SANS,IP:$HOST_IP"
fi

openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
  -keyout /etc/ssl/private/nginx-selfsigned.key \
  -out /etc/ssl/certs/nginx-selfsigned.crt \
  -subj "/CN=3dmrp-local" \
  -addext "subjectAltName=$SANS" \
  2>/dev/null
