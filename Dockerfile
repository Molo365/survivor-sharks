FROM node:22-slim
WORKDIR /app
COPY . .
RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile
RUN pnpm --filter @workspace/survivor-sharks build
RUN pnpm --filter @workspace/api-server build
EXPOSE 3000
CMD ["node", "artifacts/api-server/dist/index.mjs"]
