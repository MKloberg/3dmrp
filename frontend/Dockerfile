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
RUN apk add --no-cache openssl
COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY docker-entrypoint.sh /docker-entrypoint.d/10-gen-cert.sh
RUN chmod +x /docker-entrypoint.d/10-gen-cert.sh
EXPOSE 80 443
