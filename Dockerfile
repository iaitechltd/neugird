# NeuGrid — production container for Cloud Run.
# Multi-stage: install deps → build (Next standalone) → minimal runtime image.
# syntax=docker/dockerfile:1

# ---- deps: full install for the build ----
FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
RUN npm ci

# ---- build: compile the app (emits .next/standalone) + stage `pg` in isolation ----
FROM node:22-alpine AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build
# `pg`, `@anthropic-ai/sdk`, and the Solana/ICP rail packages are imported via
# non-analyzable specifiers (so the app builds without them), so Next's file
# tracer leaves them out of the standalone bundle. Resolve them + their deps into
# an isolated tree we overlay onto the runtime node_modules. The Solana set powers
# chain/sasSolana.ts (SAS credential mints) when NEUGRID_CHAIN_MODE=solana; the
# @dfinity set powers chain/icpHosting.ts (the /d/ asset-canister mirror, A3).
RUN mkdir -p /pgmod && cd /pgmod && npm init -y >/dev/null 2>&1 \
    && npm install pg@8.22.0 @anthropic-ai/sdk@0.109.1 qrcode@1.5.3 \
       sas-lib @solana/kit @solana-program/token-2022 @solana-program/compute-budget \
       @coinbase/x402@2.1.0 @coral-xyz/anchor@0.31.1 @solana/spl-token@0.4.14 \
       @identity.com/solana-gateway-ts \
       @dfinity/agent@3.4.3 @dfinity/assets@3.4.3 @dfinity/identity@3.4.3 \
       --legacy-peer-deps --omit=dev --no-audit --no-fund

# ---- runtime: only the standalone server + static + public (+ pg) ----
FROM node:22-alpine AS runner
WORKDIR /app
ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=8080 \
    HOSTNAME=0.0.0.0
RUN addgroup -S nodejs && adduser -S nextjs -G nodejs

COPY --from=build /app/.next/standalone ./
COPY --from=build /app/.next/static ./.next/static
COPY --from=build /app/public ./public
# Overlay `pg` (+ deps) into the traced standalone node_modules.
COPY --from=build /pgmod/node_modules ./node_modules

USER nextjs
EXPOSE 8080
# Cloud Run injects PORT; the Next standalone server honors PORT + HOSTNAME.
CMD ["node", "server.js"]
