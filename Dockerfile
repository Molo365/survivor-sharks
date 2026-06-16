FROM node:22-alpine
RUN apk add --no-cache python3 make g++
WORKDIR /app
COPY . .
RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile --ignore-scripts
RUN pnpm add -w @rollup/rollup-linux-x64-musl
RUN pnpm rebuild esbuild sharp
RUN pnpm --filter @workspace/survivor-sharks build
RUN pnpm --filter @workspace/api-server build
EXPOSE 3000
CMD ["node", "artifacts/api-server/dist/index.mjs"]
