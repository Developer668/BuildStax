FROM node:24-bookworm-slim AS dependencies
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund --loglevel=error

FROM node:24-bookworm-slim AS production-dependencies
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY package.json package-lock.json .npmrc ./
RUN npm ci --omit=dev --no-audit --no-fund --loglevel=error

FROM node:24-bookworm-slim AS zero-runner
ENV NPM_CONFIG_UPDATE_NOTIFIER=false
RUN npm install --global --no-audit --no-fund --loglevel=error @zeroxyz/cli@1.26.0

FROM node:24-bookworm-slim AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1 \
    NPM_CONFIG_UPDATE_NOTIFIER=false
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:24-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production \
    APP_MODE=production \
    DATA_BACKEND=insforge \
    NEXT_TELEMETRY_DISABLED=1 \
    HOSTNAME=0.0.0.0 \
    PORT=3000 \
    ZERO_RUNNER=/usr/local/bin/zero

RUN groupadd --gid 1001 nodejs \
  && useradd --uid 1001 --gid nodejs --create-home --shell /usr/sbin/nologin nextjs \
  && mkdir -p /app/data \
  && chown -R nextjs:nodejs /app/data

COPY --from=production-dependencies --chown=nextjs:nodejs /app/node_modules ./node_modules
COPY --from=builder --chown=nextjs:nodejs /app/.next ./.next
COPY --from=builder --chown=nextjs:nodejs /app/public ./public
COPY --from=builder --chown=nextjs:nodejs /app/drizzle ./drizzle
COPY --from=builder --chown=nextjs:nodejs /app/src ./src
COPY --from=builder --chown=nextjs:nodejs /app/server.mts /app/package.json /app/tsconfig.json /app/next.config.ts ./
COPY --from=zero-runner /usr/local/lib/node_modules/@zeroxyz/cli /usr/local/lib/node_modules/@zeroxyz/cli
RUN ln -s /usr/local/lib/node_modules/@zeroxyz/cli/dist/index.js /usr/local/bin/zero \
  && zero --version

USER nextjs
VOLUME ["/app/data"]
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=15s --retries=3 \
  CMD ["node", "-e", "fetch('http://127.0.0.1:3000/api/health').then(r=>{if(!r.ok)process.exit(1)}).catch(()=>process.exit(1))"]

STOPSIGNAL SIGTERM
CMD ["./node_modules/.bin/tsx", "server.mts"]
