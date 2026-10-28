FROM node:24-slim AS base
WORKDIR /app

FROM base AS deps
COPY package.json package-lock.json* ./
RUN npm install --include=dev --no-audit --no-fund && node node_modules/esbuild/install.js

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV WS_PORT=4301
ENV PROJECT_NAME="RTS-MK1"
ENV PUBLIC_DNS_DOMAIN="rts-mk1.orbital8.cloud"
ENV NEXT_PUBLIC_APP_URL="https://rts-mk1.orbital8.cloud"
ENV NEXT_PUBLIC_WS_URL="wss://rts-mk1.orbital8.cloud/ws"
ENV INTERNAL_WS_API_URL="http://rts-mk1-ws:4301"
ENV RTS_DB_PATH="/app/data/rts-mk1.sqlite"

RUN mkdir -p /app/data && chown -R node:node /app

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node package.json tsconfig.json ./
COPY --chown=node:node src ./src

USER node
EXPOSE 4301
CMD ["npx", "tsx", "src/server/ws-server.ts"]
