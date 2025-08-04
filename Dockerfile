FROM node:18-alpine

# Install curl for health checks
RUN apk add --no-cache curl

# Create app directory
WORKDIR /app

# Copy server package files and install dependencies
COPY server/package*.json ./server/
RUN cd server && npm install --only=production

# Copy server source code
COPY server/ ./server/

# Copy frontend files
COPY app/ ./app/

# Create data directory for SQLite database
RUN mkdir -p server/data

# Create a simple startup script
COPY docker-start.sh ./
RUN chmod +x docker-start.sh

# Expose port
EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD curl -f http://localhost:3000/api/health || exit 1

# Start the application
CMD ["./docker-start.sh"]