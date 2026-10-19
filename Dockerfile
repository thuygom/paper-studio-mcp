FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY index.html vite.config.js ./
COPY src ./src
RUN npm run build && npm prune --omit=dev

FROM docker:29-cli AS docker-cli
FROM node:24-bookworm-slim
WORKDIR /app
COPY --from=docker-cli /usr/local/bin/docker /usr/local/bin/docker
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json ./
COPY server ./server
COPY scripts ./scripts
COPY tests ./tests
ENV HOST=0.0.0.0 PORT=17882 PRIVATE_DIR=/data
EXPOSE 17882
CMD ["node", "server/index.mjs"]
