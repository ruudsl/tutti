#!/bin/bash
#
# Tutti Backup Script
# Creates a timestamped backup of the database and uploaded files.
#
# Usage:
#   ./scripts/backup.sh                    # Backup to default location
#   ./scripts/backup.sh /path/to/backups   # Backup to custom location
#   ./scripts/backup.sh --docker           # Backup from Docker volumes
#
# The script creates:
#   - tutti-backup-YYYYMMDD-HHMMSS.tar.gz containing:
#     - tutti.db (SQLite database)
#     - uploads/ (all uploaded files)
#     - backup-info.json (metadata)

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
TIMESTAMP=$(date +"%Y%m%d-%H%M%S")
BACKUP_NAME="tutti-backup-${TIMESTAMP}"

# Default paths (can be overridden)
BACKUP_DIR="${1:-${PROJECT_DIR}/backups}"
DOCKER_MODE=false

# Parse arguments
for arg in "$@"; do
    case $arg in
        --docker)
            DOCKER_MODE=true
            shift
            ;;
    esac
done

# Functions
log_info() {
    echo -e "${GREEN}[INFO]${NC} $1"
}

log_warn() {
    echo -e "${YELLOW}[WARN]${NC} $1"
}

log_error() {
    echo -e "${RED}[ERROR]${NC} $1"
}

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Create temporary directory for backup contents
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log_info "Starting Tutti backup..."
log_info "Backup will be saved to: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"

if [ "$DOCKER_MODE" = true ]; then
    log_info "Running in Docker mode..."

    # Check if containers are running
    if ! docker compose ps --services --filter "status=running" | grep -q backend; then
        log_error "Backend container is not running. Start it first with: docker compose up -d"
        exit 1
    fi

    # Get volume paths
    DATA_VOLUME=$(docker volume inspect tutti-data --format '{{.Mountpoint}}' 2>/dev/null || echo "")
    UPLOADS_VOLUME=$(docker volume inspect tutti-uploads --format '{{.Mountpoint}}' 2>/dev/null || echo "")

    if [ -z "$DATA_VOLUME" ] || [ -z "$UPLOADS_VOLUME" ]; then
        log_error "Could not find Docker volumes. Are they named tutti-data and tutti-uploads?"
        exit 1
    fi

    # Copy database (using docker cp for safety)
    log_info "Backing up database..."
    docker compose exec -T backend sh -c "cat /app/data/tutti.db" > "$TEMP_DIR/tutti.db" 2>/dev/null || {
        # Fallback: copy directly from volume (requires root)
        sudo cp "$DATA_VOLUME/tutti.db" "$TEMP_DIR/tutti.db"
    }

    # Copy uploads
    log_info "Backing up uploads..."
    mkdir -p "$TEMP_DIR/uploads"
    docker compose exec -T backend sh -c "tar -cf - -C /app/uploads ." | tar -xf - -C "$TEMP_DIR/uploads" 2>/dev/null || {
        # Fallback: copy directly from volume (requires root)
        sudo cp -r "$UPLOADS_VOLUME"/* "$TEMP_DIR/uploads/" 2>/dev/null || true
    }
else
    log_info "Running in local mode..."

    # Default local paths
    DB_PATH="${DB_PATH:-${PROJECT_DIR}/backend/data/tutti.db}"
    UPLOADS_PATH="${UPLOADS_PATH:-${PROJECT_DIR}/backend/uploads}"

    # Check if database exists
    if [ ! -f "$DB_PATH" ]; then
        log_error "Database not found at: $DB_PATH"
        log_info "Set DB_PATH environment variable or run with --docker flag"
        exit 1
    fi

    # Copy database
    log_info "Backing up database..."
    cp "$DB_PATH" "$TEMP_DIR/tutti.db"

    # Copy uploads
    log_info "Backing up uploads..."
    mkdir -p "$TEMP_DIR/uploads"
    if [ -d "$UPLOADS_PATH" ]; then
        cp -r "$UPLOADS_PATH"/* "$TEMP_DIR/uploads/" 2>/dev/null || true
    fi
fi

# Create backup metadata
log_info "Creating backup metadata..."
cat > "$TEMP_DIR/backup-info.json" << EOF
{
    "timestamp": "$(date -Iseconds)",
    "version": "1.0",
    "docker_mode": $DOCKER_MODE,
    "hostname": "$(hostname)",
    "database_size": $(stat -f%z "$TEMP_DIR/tutti.db" 2>/dev/null || stat -c%s "$TEMP_DIR/tutti.db"),
    "uploads_count": $(find "$TEMP_DIR/uploads" -type f 2>/dev/null | wc -l | tr -d ' '),
    "uploads_size": $(du -sb "$TEMP_DIR/uploads" 2>/dev/null | cut -f1 || echo 0)
}
EOF

# Create the tarball
log_info "Creating backup archive..."
tar -czf "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" -C "$TEMP_DIR" .

# Calculate backup size
BACKUP_SIZE=$(du -h "${BACKUP_DIR}/${BACKUP_NAME}.tar.gz" | cut -f1)

log_info "Backup completed successfully!"
log_info "Backup file: ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
log_info "Backup size: ${BACKUP_SIZE}"

# Cleanup old backups (keep last 7 by default)
KEEP_BACKUPS=${KEEP_BACKUPS:-7}
BACKUP_COUNT=$(ls -1 "$BACKUP_DIR"/tutti-backup-*.tar.gz 2>/dev/null | wc -l)

if [ "$BACKUP_COUNT" -gt "$KEEP_BACKUPS" ]; then
    log_info "Cleaning up old backups (keeping last $KEEP_BACKUPS)..."
    ls -1t "$BACKUP_DIR"/tutti-backup-*.tar.gz | tail -n +$((KEEP_BACKUPS + 1)) | xargs rm -f
fi

echo ""
echo "To restore this backup, run:"
echo "  ./scripts/restore.sh ${BACKUP_DIR}/${BACKUP_NAME}.tar.gz"
