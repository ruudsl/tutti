#!/bin/bash
#
# Tutti Restore Script
# Restores a backup created by backup.sh
#
# Usage:
#   ./scripts/restore.sh backup.tar.gz                 # Restore to default location
#   ./scripts/restore.sh backup.tar.gz --docker        # Restore to Docker volumes
#   ./scripts/restore.sh backup.tar.gz --dry-run       # Show what would be restored
#
# WARNING: This will overwrite existing data!

set -euo pipefail

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
DOCKER_MODE=false
DRY_RUN=false

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

show_usage() {
    echo "Usage: $0 <backup-file.tar.gz> [options]"
    echo ""
    echo "Options:"
    echo "  --docker     Restore to Docker volumes"
    echo "  --dry-run    Show what would be restored without making changes"
    echo "  --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0 backups/tutti-backup-20240101-120000.tar.gz"
    echo "  $0 backups/tutti-backup-20240101-120000.tar.gz --docker"
}

# Parse arguments
BACKUP_FILE=""
for arg in "$@"; do
    case $arg in
        --docker)
            DOCKER_MODE=true
            ;;
        --dry-run)
            DRY_RUN=true
            ;;
        --help|-h)
            show_usage
            exit 0
            ;;
        *)
            if [ -z "$BACKUP_FILE" ]; then
                BACKUP_FILE="$arg"
            fi
            ;;
    esac
done

# Validate arguments
if [ -z "$BACKUP_FILE" ]; then
    log_error "No backup file specified"
    show_usage
    exit 1
fi

if [ ! -f "$BACKUP_FILE" ]; then
    log_error "Backup file not found: $BACKUP_FILE"
    exit 1
fi

# Create temporary directory for extraction
TEMP_DIR=$(mktemp -d)
trap "rm -rf $TEMP_DIR" EXIT

log_info "Extracting backup: $BACKUP_FILE"
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Validate backup contents
if [ ! -f "$TEMP_DIR/tutti.db" ]; then
    log_error "Invalid backup: tutti.db not found"
    exit 1
fi

if [ ! -f "$TEMP_DIR/backup-info.json" ]; then
    log_warn "Backup metadata not found, continuing anyway..."
else
    log_info "Backup info:"
    cat "$TEMP_DIR/backup-info.json" | python3 -m json.tool 2>/dev/null || cat "$TEMP_DIR/backup-info.json"
    echo ""
fi

# Count files to restore
DB_SIZE=$(du -h "$TEMP_DIR/tutti.db" | cut -f1)
UPLOADS_COUNT=$(find "$TEMP_DIR/uploads" -type f 2>/dev/null | wc -l | tr -d ' ')

log_info "Database size: $DB_SIZE"
log_info "Uploads to restore: $UPLOADS_COUNT files"

if [ "$DRY_RUN" = true ]; then
    log_info "Dry run mode - no changes will be made"
    log_info "Would restore database and $UPLOADS_COUNT upload files"
    exit 0
fi

# Confirm restore
echo ""
log_warn "WARNING: This will overwrite existing data!"
read -p "Are you sure you want to continue? (yes/no): " CONFIRM

if [ "$CONFIRM" != "yes" ]; then
    log_info "Restore cancelled"
    exit 0
fi

if [ "$DOCKER_MODE" = true ]; then
    log_info "Restoring to Docker volumes..."

    # Check if containers are running
    if docker compose ps --services --filter "status=running" | grep -q backend; then
        log_info "Stopping backend container..."
        docker compose stop backend
        RESTART_BACKEND=true
    else
        RESTART_BACKEND=false
    fi

    # Restore database
    log_info "Restoring database..."
    docker compose run --rm -v "$TEMP_DIR:/backup:ro" backend sh -c "cp /backup/tutti.db /app/data/tutti.db"

    # Restore uploads
    log_info "Restoring uploads..."
    docker compose run --rm -v "$TEMP_DIR:/backup:ro" backend sh -c "rm -rf /app/uploads/* && cp -r /backup/uploads/* /app/uploads/ 2>/dev/null || true"

    # Restart backend if it was running
    if [ "$RESTART_BACKEND" = true ]; then
        log_info "Starting backend container..."
        docker compose start backend
    fi
else
    log_info "Restoring to local paths..."

    # Default local paths
    DB_PATH="${DB_PATH:-${PROJECT_DIR}/backend/data/tutti.db}"
    UPLOADS_PATH="${UPLOADS_PATH:-${PROJECT_DIR}/backend/uploads}"

    # Create directories if they don't exist
    mkdir -p "$(dirname "$DB_PATH")"
    mkdir -p "$UPLOADS_PATH"

    # Backup current database (just in case)
    if [ -f "$DB_PATH" ]; then
        CURRENT_BACKUP="${DB_PATH}.pre-restore.$(date +%Y%m%d-%H%M%S)"
        log_info "Backing up current database to: $CURRENT_BACKUP"
        cp "$DB_PATH" "$CURRENT_BACKUP"
    fi

    # Restore database
    log_info "Restoring database..."
    cp "$TEMP_DIR/tutti.db" "$DB_PATH"

    # Restore uploads
    log_info "Restoring uploads..."
    if [ -d "$TEMP_DIR/uploads" ]; then
        cp -r "$TEMP_DIR/uploads"/* "$UPLOADS_PATH/" 2>/dev/null || true
    fi
fi

log_info "Restore completed successfully!"

if [ "$DOCKER_MODE" = true ]; then
    echo ""
    echo "If the application is not running, start it with:"
    echo "  docker compose up -d"
fi
