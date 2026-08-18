# Backup and Restore Guide

This guide explains how to backup and restore your Harmonie data, including the database and uploaded files.

## Overview

Harmonie uses SQLite as its database, which stores all application data in a single file. Backups include:

- **Database** (`harmonie.db`) - Contains all members, music pieces, events, annotations, and other data
- **PDF files** - Sheet music uploads
- **MP3 files** - Audio recordings

Backups are created as ZIP archives with maximum compression.

## Backup Contents

A backup ZIP file contains:

```
harmonie-backup-YYYY-MM-DDTHH-mm-ss.zip
├── database/
│   └── harmonie.db           # SQLite database
├── uploads/
│   ├── [original-name].pdf   # PDF files (with original filenames)
│   └── mp3/
│       └── [title].mp3       # MP3 files (named by title)
└── manifest.json             # File mapping for restore
```

The manifest file maps internal filenames to archive names, enabling proper restoration.

## How Backups Work

### Data Storage

- **Database**: Single SQLite file at the configured `DB_PATH`
- **PDF uploads**: Stored in `UPLOAD_DIR` (default: `backend/uploads/`)
- **MP3 uploads**: Stored in `MP3_UPLOAD_DIR` (default: `backend/uploads/mp3/`)

### Backup Process

1. The database file is copied as-is
2. File paths are retrieved from the database to preserve original filenames
3. Files are added with human-readable names (handling duplicates with suffixes)
4. A manifest is created to map stored filenames to archive names

## Manual Backup Procedures

### Via the Web Interface

1. Log in as an administrator
2. Navigate to **Settings** > **Backup**
3. Click **Download Backup**
4. Save the ZIP file to a secure location

### Via Command Line

You can create a backup directly by copying the necessary files:

```bash
# Set paths (adjust to your installation)
DB_PATH="/path/to/harmonie.db"
UPLOAD_DIR="/path/to/uploads"
BACKUP_DIR="/path/to/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Create backup directory
mkdir -p "$BACKUP_DIR/$TIMESTAMP"

# Copy database
cp "$DB_PATH" "$BACKUP_DIR/$TIMESTAMP/harmonie.db"

# Copy uploads
cp -r "$UPLOAD_DIR" "$BACKUP_DIR/$TIMESTAMP/uploads"

# Create archive
cd "$BACKUP_DIR"
zip -r "harmonie-backup-$TIMESTAMP.zip" "$TIMESTAMP"
```

### Via API

```bash
curl -X GET \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -o "harmonie-backup.zip" \
  https://your-domain/api/backup
```

## Automated Backup Setup

### Using Cron (Linux/macOS)

Create a backup script:

```bash
#!/bin/bash
# /opt/harmonie/scripts/backup.sh

BACKUP_DIR="/var/backups/harmonie"
DB_PATH="/opt/harmonie/data/harmonie.db"
UPLOAD_DIR="/opt/harmonie/uploads"
RETENTION_DAYS=30

# Create timestamp
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/harmonie-backup-$TIMESTAMP.zip"

# Ensure backup directory exists
mkdir -p "$BACKUP_DIR"

# Create temporary directory
TMP_DIR=$(mktemp -d)
mkdir -p "$TMP_DIR/database" "$TMP_DIR/uploads"

# Copy database (use WAL checkpoint for consistency)
sqlite3 "$DB_PATH" ".backup '$TMP_DIR/database/harmonie.db'"

# Copy uploads
cp -r "$UPLOAD_DIR"/* "$TMP_DIR/uploads/" 2>/dev/null || true

# Create ZIP
cd "$TMP_DIR"
zip -r "$BACKUP_FILE" .

# Cleanup
rm -rf "$TMP_DIR"

# Remove old backups
find "$BACKUP_DIR" -name "harmonie-backup-*.zip" -mtime +$RETENTION_DAYS -delete

echo "Backup created: $BACKUP_FILE"
```

Add to crontab for daily backups at 2 AM:

```bash
crontab -e
# Add line:
0 2 * * * /opt/harmonie/scripts/backup.sh >> /var/log/harmonie-backup.log 2>&1
```

### Using Systemd Timer

Create service file (`/etc/systemd/system/harmonie-backup.service`):

```ini
[Unit]
Description=Harmonie Backup

[Service]
Type=oneshot
ExecStart=/opt/harmonie/scripts/backup.sh
User=harmonie
```

Create timer file (`/etc/systemd/system/harmonie-backup.timer`):

```ini
[Unit]
Description=Daily Harmonie Backup

[Timer]
OnCalendar=*-*-* 02:00:00
Persistent=true

[Install]
WantedBy=timers.target
```

Enable the timer:

```bash
sudo systemctl enable harmonie-backup.timer
sudo systemctl start harmonie-backup.timer
```

### Cloud Backup Integration

After creating local backups, sync to cloud storage:

```bash
# AWS S3
aws s3 sync /var/backups/harmonie s3://your-bucket/harmonie-backups/

# Google Cloud Storage
gsutil rsync /var/backups/harmonie gs://your-bucket/harmonie-backups/

# Backblaze B2
b2 sync /var/backups/harmonie b2://your-bucket/harmonie-backups/
```

## Restore Procedures

### Via the Web Interface

1. Log in as an administrator
2. Navigate to **Settings** > **Backup**
3. Click **Restore**
4. Select the backup ZIP file
5. Confirm the restore operation
6. Wait for the process to complete
7. The page will automatically reload

**Warning**: Restoring a backup will overwrite all current data!

### Via Command Line

```bash
# Extract backup
unzip harmonie-backup-TIMESTAMP.zip -d /tmp/restore

# Stop the application
systemctl stop harmonie

# Restore database
cp /tmp/restore/database/harmonie.db "$DB_PATH"

# Restore uploads (clear existing first if desired)
rm -rf "$UPLOAD_DIR"/*
cp -r /tmp/restore/uploads/* "$UPLOAD_DIR/"

# Fix permissions
chown -R harmonie:harmonie "$DB_PATH" "$UPLOAD_DIR"

# Start the application
systemctl start harmonie

# Cleanup
rm -rf /tmp/restore
```

### Via API

```bash
curl -X POST \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -F "backup=@harmonie-backup.zip" \
  https://your-domain/api/backup/restore
```

## Backup Verification

### Check Backup Integrity

```bash
# Verify ZIP integrity
unzip -t harmonie-backup.zip

# Check database can be opened
unzip -p harmonie-backup.zip database/harmonie.db > /tmp/test.db
sqlite3 /tmp/test.db "PRAGMA integrity_check;"
rm /tmp/test.db
```

### Verify Backup Contents

```bash
# List contents
unzip -l harmonie-backup.zip

# Check manifest
unzip -p harmonie-backup.zip manifest.json | jq .
```

### Test Restore (Recommended)

Periodically test restores in a staging environment:

1. Set up a test instance of Harmonie
2. Restore the backup
3. Verify data integrity:
   - Check member counts
   - Verify music pieces are accessible
   - Test PDF and MP3 file access
   - Check event data

## Disaster Recovery

### Recovery Plan

1. **Identify the latest valid backup**
   - Check backup timestamps
   - Verify integrity of candidate backups

2. **Prepare the recovery environment**
   - Ensure all dependencies are installed
   - Configure environment variables

3. **Restore the backup**
   - Follow the restore procedure above
   - Document any issues encountered

4. **Verify the restoration**
   - Test all critical functionality
   - Check data consistency
   - Verify file uploads are accessible

5. **Update DNS/Load Balancer** (if restoring to new infrastructure)

### Recovery Time Objectives

| Scenario                                | Expected Recovery Time |
| --------------------------------------- | ---------------------- |
| Database corruption                     | 15-30 minutes          |
| Server failure (with hot standby)       | 5-10 minutes           |
| Full infrastructure rebuild             | 1-4 hours              |
| Complete disaster (from offsite backup) | 2-8 hours              |

### Best Practices

1. **Test backups regularly** - At least monthly, restore to a test environment
2. **Use the 3-2-1 rule**:
   - 3 copies of data
   - 2 different storage types
   - 1 offsite location
3. **Monitor backup jobs** - Set up alerts for backup failures
4. **Document restore procedures** - Keep this guide updated
5. **Secure backup files** - Encrypt sensitive backups
6. **Maintain backup retention** - Keep multiple generations

### Data Recovery Contacts

In case of data issues, consider:

- Check application logs for error details
- Review the manifest.json for file mappings
- Contact your system administrator
- Review Harmonie documentation and issue tracker

## Troubleshooting

### Common Issues

**Backup download fails**

- Check available disk space
- Verify admin permissions
- Check network timeout settings

**Restore fails with "Invalid backup file"**

- Ensure file is a valid ZIP archive
- Check file was not corrupted during transfer
- Verify backup was created by Harmonie

**Files missing after restore**

- Check manifest.json for file mappings
- Verify uploads directory permissions
- Check backup included all expected files

**Database locked during backup**

- Ensure no other processes are writing
- Use SQLite's backup API for consistency
- Consider enabling WAL mode
