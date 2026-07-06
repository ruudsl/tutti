# Tutti Backend Dockerfile
# Multi-stage build for smaller production image
#
# NOTE: build this image from the repository ROOT as context, e.g.:
#   docker build -f backend/Dockerfile .
# The package-lock.json lives in the workspace root, so the root context is
# required for a reproducible `npm ci` install.

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:26-alpine AS builder

WORKDIR /app

# Copy workspace manifests (lockfile lives in the repo root)
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

# Reproducible install of backend workspace dependencies (including dev for build)
RUN npm ci --workspace=backend --include-workspace-root=false

# Copy backend source code
COPY backend ./backend

# Build TypeScript
RUN npm run build --workspace=backend

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:26-alpine AS production

LABEL org.opencontainers.image.title="Tutti Backend"
LABEL org.opencontainers.image.description="Backend API for Tutti - Orchestra Music Management"
LABEL org.opencontainers.image.vendor="Tutti"
LABEL org.opencontainers.image.source="https://github.com/ruudsl/tutti"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Create non-root user for security
RUN addgroup -g 1001 -S tutti && \
    adduser -S tutti -u 1001 -G tutti

# Copy workspace manifests and install production dependencies only
COPY package.json package-lock.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/
RUN npm ci --workspace=backend --include-workspace-root=false --omit=dev && \
    npm cache clean --force

# Copy built application from builder stage
COPY --from=builder /app/backend/dist ./backend/dist

# Create directories for data and uploads
RUN mkdir -p /app/data /app/uploads && \
    chown -R tutti:tutti /app

# Switch to non-root user
USER tutti

# Environment variables with defaults
ENV NODE_ENV=production
ENV PORT=3001
ENV DB_PATH=/app/data/tutti.db
ENV UPLOAD_DIR=/app/uploads

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:3001/api/health || exit 1

# Start the application
CMD ["node", "backend/dist/index.js"]
