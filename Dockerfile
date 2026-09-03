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

USER appuser
EXPOSE 3100
CMD ["npx", "next", "start", "-p", "3100"]
