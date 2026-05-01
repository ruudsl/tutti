# Tutti Frontend Dockerfile
# Multi-stage build: Node for building, nginx for serving

# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Build argument for API URL (can be overridden at build time)
ARG VITE_API_URL=/api
ENV VITE_API_URL=$VITE_API_URL

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci

# Copy source code
COPY . .

# Build the application
RUN npm run build

# =============================================================================
# Stage 2: Production (nginx)
# =============================================================================
FROM nginx:alpine AS production

LABEL org.opencontainers.image.title="Tutti Frontend"
LABEL org.opencontainers.image.description="Frontend for Tutti - Orchestra Music Management"
LABEL org.opencontainers.image.vendor="Tutti"
LABEL org.opencontainers.image.source="https://github.com/ruudsl/tutti"
LABEL org.opencontainers.image.licenses="MIT"

# Copy built application from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Create non-root user (nginx runs as nginx user by default)
RUN chown -R nginx:nginx /usr/share/nginx/html && \
    chmod -R 755 /usr/share/nginx/html

# Expose port
EXPOSE 80

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
