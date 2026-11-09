FROM node:22-bookworm-slim AS base
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
# Prisma's migration engine requires OpenSSL at build time and at runtime.
RUN apt-get update \
    && apt-get install -y --no-install-recommends openssl ca-certificates \
    && rm -rf /var/lib/apt/lists/*

FROM base AS dependencies
COPY package.json package-lock.json ./
# Keep dependency installation independent of application source changes.
RUN npm ci --no-audit --no-fund

FROM dependencies AS build
COPY . .
RUN npm run build && rm -rf .next/cache

FROM dependencies AS production-dependencies
# Reuse installed packages; do not perform a second network installation.
RUN npm prune --omit=dev --ignore-scripts --no-audit --no-fund --offline

FROM base AS runtime
ENV NODE_ENV=production
COPY --from=production-dependencies --chown=node:node /app/node_modules ./node_modules
COPY --from=build --chown=node:node /app/.next ./.next
COPY --from=build --chown=node:node /app/generated ./generated
COPY --from=build --chown=node:node /app/prisma ./prisma
COPY --from=build --chown=node:node /app/lib ./lib
COPY --from=build --chown=node:node /app/scripts ./scripts
COPY --from=build --chown=node:node /app/package.json /app/package-lock.json /app/next.config.mjs /app/prisma.config.ts ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
