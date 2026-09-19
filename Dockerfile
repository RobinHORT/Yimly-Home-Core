# ==============================================================================
# Yimly Home Assistant Server - Production Dockerfile
# Combines Real Home Assistant Core Backend with Custom Yimly Frontend
# ==============================================================================

# Stage 1: Build the Custom Yimly Frontend
FROM node:22-alpine AS frontend-builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . ./
RUN npm run build

# Stage 2: Real Home Assistant Core Base Image
FROM ghcr.io/home-assistant/home-assistant:2024.12.5 AS production

# Install Node.js runtime to host the unified Yimly server bridge
RUN apk add --no-cache nodejs npm curl bash

WORKDIR /app

# Copy production frontend build and server
COPY package*.json ./
RUN npm ci --only=production
COPY --from=frontend-builder /app/dist ./dist
COPY server.ts ./server.ts
COPY config /config

# Expose Home Assistant HTTP Port and Yimly Interface Port
EXPOSE 8123 3000

# Persistent storage volume for HA Core configuration, auth, recorder, and registries
VOLUME ["/config"]

# Environment variables
ENV PYTHONUNBUFFERED=1 \
    NODE_ENV=production \
    HA_CONFIG_DIR=/config \
    HA_PORT=8123 \
    PORT=3000

# Health check directly verifying that Home Assistant Core is responding
HEALTHCHECK --interval=30s --timeout=10s --start-period=45s --retries=3 \
  CMD curl -f http://localhost:8123/manifest.json || curl -f http://localhost:3000/api/discovery_info || exit 1

# Start script: Boots Home Assistant Core in background, then starts Yimly Unified Proxy & UI Server
CMD ["sh", "-c", "python3 -m homeassistant -c /config & exec node --loader tsx server.ts"]
