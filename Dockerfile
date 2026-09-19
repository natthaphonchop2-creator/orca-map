FROM node:24-bookworm-slim AS build
WORKDIR /app
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN npm install --global pnpm@11.7.0 && pnpm install --frozen-lockfile
COPY . .
RUN pnpm run build

FROM node:24-bookworm-slim
ENV NODE_ENV=production HOST=0.0.0.0 PORT=4000 ORCA_BUILD_DIR=build
WORKDIR /app
COPY --chown=node:node --from=build /app/build ./build
COPY --chown=node:node server ./server
USER node
EXPOSE 4000
CMD ["node", "server/index.mjs"]
