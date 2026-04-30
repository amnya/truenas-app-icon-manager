FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runtime

ENV NODE_ENV=production \
    IX_APPS_PATH=/ix-apps \
    METADATA_FILE=/ix-apps/metadata.yaml \
    CONFIG_DIR=/config \
    POLL_INTERVAL_SECONDS=30 \
    MAX_ICON_SIZE_BYTES=524288 \
    BACKUP_RETENTION_COUNT=25 \
    PORT=8080

WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/server ./server
COPY --from=build /app/dist ./dist

EXPOSE 8080
CMD ["node", "server/index.js"]
