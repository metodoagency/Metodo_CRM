# syntax=docker/dockerfile:1
FROM node:22-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts
COPY prisma.config.ts ./
RUN --mount=type=secret,id=proxy_ca \
    if [ -f /run/secrets/proxy_ca ]; then NODE_EXTRA_CA_CERTS=/run/secrets/proxy_ca npm ci; else npm ci; fi
COPY . .
RUN npm run build && npm prune --omit=dev --ignore-scripts

FROM node:22-bookworm-slim AS runtime
WORKDIR /app
# Debian Chromium installs the system libraries needed by Playwright PDF export.
# No user files live on this ephemeral filesystem in production.
RUN apt-get update && apt-get install -y --no-install-recommends chromium ca-certificates dumb-init && rm -rf /var/lib/apt/lists/*
COPY --from=build --chown=node:node /app /app
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 PLAYWRIGHT_EXECUTABLE_PATH=/usr/bin/chromium
USER node
EXPOSE 3000
ENTRYPOINT ["dumb-init", "--"]
CMD ["npm", "start"]
