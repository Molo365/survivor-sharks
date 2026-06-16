FROM node:18-alpine
WORKDIR /app
COPY . .
RUN npm install -g pnpm
RUN pnpm install --no-frozen-lockfile
RUN cd artifacts/api-server && npm install && npm run build
EXPOSE 3000
CMD ["node", "artifacts/api-server/dist/index.js"]
