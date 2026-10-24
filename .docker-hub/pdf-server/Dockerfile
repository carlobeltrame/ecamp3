# build stage
FROM node:24.22.1 AS build-stage

COPY common /common

WORKDIR /app
COPY frontend/package*.json frontend/.npmrc ./
COPY frontend/public ./public
COPY frontend/scripts ./scripts
COPY frontend/patches ./patches
RUN npm ci

COPY frontend .
RUN npm run pdf-server:build
RUN npm prune --omit=dev

# production stage
FROM node:24.22.1-slim AS production-stage
WORKDIR /app

COPY --from=build-stage /app/package.json ./
COPY --from=build-stage /app/node_modules ./node_modules
COPY --from=build-stage /app/public/twemoji ./public/twemoji
COPY --from=build-stage /app/src/assets/fonts ./src/assets/fonts
COPY --from=build-stage /app/pdf-server ./pdf-server

ENV NODE_ENV=production
ENV PDF_SERVER_PORT=80
ENV PDF_SERVER_WORKERS=2

EXPOSE 80
CMD ["node", "pdf-server/server.js"]
