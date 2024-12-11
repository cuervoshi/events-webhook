FROM node:20-bullseye AS base

RUN groupadd --system --gid 1001 nodejs && \
    useradd --system --uid 1001 --gid nodejs nodejs

FROM base AS dependencies

RUN apt-get update && apt-get install -y --no-install-recommends openssl && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json pnpm-lock.yaml ./
COPY prisma/schema.prisma ./prisma/schema.prisma
RUN npm i -g pnpm prisma@5.9.1
RUN pnpm i --frozen-lockfile --prod

FROM base AS build

WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build:prod

FROM base AS runner

WORKDIR /app
COPY --from=dependencies /app/package.json ./package.json
COPY --from=build --chown=nodejs:nodejs /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules

USER nodejs
ENV NODE_ENV production
ENV PORT 3000
EXPOSE 3000

ENTRYPOINT ["node", "dist/index.js"]
