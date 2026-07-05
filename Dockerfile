# --- build stage ---
FROM node:22-slim AS build
WORKDIR /app
# build tools for better-sqlite3 native addon
RUN apt-get update && apt-get install -y --no-install-recommends python3 make g++ \
    && rm -rf /var/lib/apt/lists/*
COPY package.json package-lock.json* ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build
# keep only production deps
RUN npm prune --omit=dev

# --- runtime stage ---
FROM node:22-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./package.json
# schema.sql is read at runtime relative to dist/db
COPY --from=build /app/src/db/schema.sql ./dist/db/schema.sql
EXPOSE 8787
VOLUME ["/data"]
CMD ["node", "dist/index.js"]
