FROM node:20-alpine AS builder

WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

# CACHEBUST invalidates this layer (and all after) when changed, forcing a fresh source copy.
# Pass via: $env:CACHEBUST = (Get-Date -UFormat %s); docker compose build frontend
ARG CACHEBUST=1
COPY . .
# APP_VERSION is injected from the host where git is available so the sidebar shows the right tag.
ARG APP_VERSION
ENV APP_VERSION=$APP_VERSION
RUN npm run build

FROM nginx:alpine
RUN apk add --no-cache openssl && \
    openssl req -x509 -nodes -days 3650 -newkey rsa:2048 \
        -keyout /etc/ssl/private/nginx-selfsigned.key \
        -out /etc/ssl/certs/nginx-selfsigned.crt \
        -subj "/CN=3dmrp-local"
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 443
