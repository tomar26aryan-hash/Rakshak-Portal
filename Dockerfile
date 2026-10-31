FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Install production dependencies first (better layer caching)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

# Run as the unprivileged "node" user that ships with the image
USER node

EXPOSE 5000

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:${PORT:-5000}/api/health || exit 1

CMD ["node", "server.js"]
