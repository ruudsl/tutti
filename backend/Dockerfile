# Tutti Backend Dockerfile
# Multi-stage build for smaller production image

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:25-alpine AS builder

WORKDIR /app

# Install build dependencies for native modules (better-sqlite3)
RUN apk add --no-cache python3 make g++

# Copy package files
COPY package*.json ./

# Install all dependencies (including dev for build)
RUN npm ci

# Copy source code
COPY . .

# Build TypeScript
RUN npm run build

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:25-alpine AS production

LABEL org.opencontainers.image.title="Tutti Backend"
LABEL org.opencontainers.image.description="Backend API for Tutti - Orchestra Music Management"
LABEL org.opencontainers.image.vendor="Tutti"
LABEL org.opencontainers.image.source="https://github.com/ruudsl/tutti"
LABEL org.opencontainers.image.licenses="MIT"

WORKDIR /app

# Install runtime dependencies for better-sqlite3
RUN apk add --no-cache python3 make g++

# Create non-root user for security
RUN addgroup -g 1001 -S tutti && \
    adduser -S tutti -u 1001 -G tutti

# Copy package files and install production dependencies only
COPY package*.json ./
RUN npm ci --omit=dev && \
    npm cache clean --force

# Rebuild native modules for production
RUN npm rebuild better-sqlite3

# Copy built application from builder stage
COPY --from=builder /app/dist ./dist

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
CMD ["node", "dist/index.js"]
