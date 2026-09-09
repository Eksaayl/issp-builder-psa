FROM node:22-slim AS deps
WORKDIR /app
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-slim AS builder
WORKDIR /app
ARG NEXT_PUBLIC_BASE_PATH=/issp
ENV NEXT_PUBLIC_BASE_PATH=$NEXT_PUBLIC_BASE_PATH
ENV PUPPETEER_SKIP_DOWNLOAD=true
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ARG NEON_AUTH_COOKIE_SECRET
ENV NEON_AUTH_COOKIE_SECRET=$NEON_AUTH_COOKIE_SECRET

ARG NEON_AUTH_BASE_URL
ENV NEON_AUTH_BASE_URL=$NEON_AUTH_BASE_URL

ARG DATABASE_URL
ENV DATABASE_URL=$DATABASE_URL
RUN npx prisma generate
RUN npm run build

FROM node:22-slim AS runner
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_PUBLIC_BASE_PATH=/issp
ENV PORT=3100
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Chromium + font deps
RUN apt-get update && apt-get install -y --no-install-recommends \
    chromium \
    libatk1.0-0 libatk-bridge2.0-0 libcups2 libdrm2 libxkbcommon0 \
    libxcomposite1 libxdamage1 libxfixes3 libxrandr2 libgbm1 libasound2 \
    libpango-1.0-0 libpangocairo-1.0-0 libcairo2 libnss3 libnspr4 \
    fonts-urw-base35 ca-certificates \
    && fc-cache -f \
    && rm -rf /var/lib/apt/lists/*

RUN useradd -m -u 10001 appuser
COPY --from=builder --chown=appuser:appuser /app/.next ./.next
COPY --from=builder --chown=appuser:appuser /app/public ./public
COPY --from=builder --chown=appuser:appuser /app/node_modules ./node_modules
COPY --from=builder --chown=appuser:appuser /app/package.json ./package.json
COPY --from=builder --chown=appuser:appuser /app/next.config.ts ./next.config.ts
COPY --from=builder --chown=appuser:appuser /app/src/app/og-fonts ./src/app/og-fonts
COPY --from=builder --chown=appuser:appuser /app/src/app/og-assets ./src/app/og-assets

# The Prisma client is generated into src/, not node_modules, and the app is not
# built as `output: standalone`, so neither the generated client nor the schema
# reaches the runner on its own. `migrate deploy` also needs the migrations at
# run time, since nothing else applies them.
COPY --from=builder --chown=appuser:appuser /app/src/generated/prisma ./src/generated/prisma
COPY --from=builder --chown=appuser:appuser /app/prisma ./prisma
COPY --from=builder --chown=appuser:appuser /app/prisma.config.ts ./prisma.config.ts

USER appuser
EXPOSE 3100
# Apply pending migrations before serving. `migrate deploy` is idempotent, so a
# restart with nothing pending is a no-op.
#
# A failure here must NOT stop the container. Editing an ISSP runs entirely in
# the browser against IndexedDB, so an unreachable database costs the upload and
# restore actions and nothing else -- but exiting turns that into a restart loop
# that takes the whole editor offline, which is far worse than the outage it is
# reacting to. The failure is loud in the logs and the app reports it per
# request; serving is not conditional on it.
CMD ["sh", "-c", "npx prisma migrate deploy || echo '[startup] prisma migrate deploy failed - the app will start, but uploads and restores will fail until the database is reachable'; npx next start -p 3100"]
