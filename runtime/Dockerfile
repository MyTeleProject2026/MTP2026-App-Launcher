FROM debian:bookworm-slim
ENV DEBIAN_FRONTEND=noninteractive NODE_ENV=production PORT=10000
RUN apt-get update && apt-get install -y --no-install-recommends \
    nodejs npm qemu-system-arm qemu-utils novnc websockify ca-certificates curl tar gzip \
    && rm -rf /var/lib/apt/lists/*
WORKDIR /opt/mtp2026-runtime
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
RUN mkdir -p /var/lib/mtp2026 /tmp/mtp2026-guests && chown -R nobody:nogroup /var/lib/mtp2026 /tmp/mtp2026-guests
USER nobody
EXPOSE 10000
CMD ["node", "server.js"]
