# Tutti Self-Hosting Guide

This guide explains how to deploy Tutti on your own server using Docker.

## Table of Contents

- [Requirements](#requirements)
- [Quick Start](#quick-start)
- [Production Deployment](#production-deployment)
- [Configuration](#configuration)
- [Backup & Restore](#backup--restore)
- [Updating](#updating)
- [Troubleshooting](#troubleshooting)

---

## Requirements

### Minimum System Requirements

| Resource | Minimum        | Recommended      |
| -------- | -------------- | ---------------- |
| CPU      | 1 core         | 2 cores          |
| RAM      | 1 GB           | 2 GB             |
| Disk     | 10 GB          | 20 GB+           |
| OS       | Linux (64-bit) | Ubuntu 22.04 LTS |

### Software Requirements

- Docker Engine 24.0+
- Docker Compose v2.20+
- (Optional) Domain name with DNS pointing to your server
- (Optional) Open ports 80 and 443 for HTTPS

### Check Docker Installation

```bash
docker --version    # Should be 24.0 or higher
docker compose version  # Should be 2.20 or higher
```

If Docker is not installed:

```bash
# Ubuntu/Debian
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# Log out and back in for group changes to take effect
```

---

## Quick Start

For testing or development:

```bash
# 1. Clone the repository
git clone https://github.com/ruudsl/tutti.git
cd tutti

# 2. Copy environment file
cp .env.example .env

# 3. Generate a secure JWT secret
echo "JWT_SECRET=$(openssl rand -base64 32)" >> .env

# 4. Start Tutti
docker compose up -d

# 5. Open in browser
open http://localhost:5173
```

`docker compose up` haalt de gepubliceerde images op; je hebt dus geen bouwomgeving nodig. Wil je toch zelf bouwen, bijvoorbeeld na een eigen aanpassing, dan doet `docker compose build` dat en zet dezelfde naam erop.

### Kant-en-klare images

De images staan op GitHub Container Registry en worden bij elke merge naar `main` opnieuw gepubliceerd:

```bash
docker pull ghcr.io/ruudsl/tutti-backend:latest
docker pull ghcr.io/ruudsl/tutti-frontend:latest
```

Naast `latest` krijgt elke build een label met zijn commit (`sha-a1b2c3d`), en een versietag `v1.2.3` levert ook `1.2.3`, `1.2` en `1` op. Voor een productieomgeving is het verstandig om een versie vast te zetten in plaats van `latest` te volgen: dan weet je wat er draait, en een terugdraaiactie is een kwestie van het label wijzigen.

Aanmelden hoeft niet voor een openbare repository. Is de repository privé, dan eerst:

```bash
echo <je-token> | docker login ghcr.io -u <je-github-naam> --password-stdin
```

Default credentials will be shown in the logs on first startup:

```bash
docker compose logs backend | grep -i password
```

---

## Production Deployment

### 1. Prepare Your Server

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Docker (if not installed)
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER

# Install useful tools
sudo apt install -y git htop
```

### 2. Clone and Configure

```bash
# Clone repository
git clone https://github.com/ruudsl/tutti.git
cd tutti

# Copy and edit environment file
cp .env.example .env
nano .env
```

Edit `.env` with your settings:

```env
# Required: Your domain name
DOMAIN=tutti.yourorganization.com

# Required: Email for SSL certificates
ACME_EMAIL=admin@yourorganization.com

# Required: Generate a secure secret
JWT_SECRET=your-secure-random-string

# Optional: Initial admin password
ADMIN_INIT_PASSWORD=your-initial-password

# Required for Traefik dashboard (generate with htpasswd)
TRAEFIK_DASHBOARD_AUTH=admin:$$apr1$$...
```

Generate the Traefik dashboard password:

```bash
# Install htpasswd if needed
sudo apt install -y apache2-utils

# Generate password (escape $ signs for docker-compose)
echo $(htpasswd -nb admin yourpassword) | sed -e s/\\$/\\$\\$/g
```

### 3. Configure DNS

Point your domain to your server's IP address:

```
tutti.yourorganization.com  →  YOUR_SERVER_IP
```

### 4. Deploy

```bash
# Start with production configuration
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d

# Check status
docker compose ps

# View logs
docker compose logs -f
```

### 5. Verify Deployment

1. Open `https://tutti.yourorganization.com` in your browser
2. You should see the Tutti login page with a valid SSL certificate
3. Log in with the admin credentials

---

## Configuration

### Environment Variables

| Variable                 | Required | Default  | Description                               |
| ------------------------ | -------- | -------- | ----------------------------------------- |
| `DOMAIN`                 | Yes*     | -        | Your domain name (production only)        |
| `ACME_EMAIL`             | Yes*     | -        | Email for Let's Encrypt (production only) |
| `JWT_SECRET`             | Yes      | -        | Secret key for JWT tokens                 |
| `JWT_EXPIRES_IN`         | No       | `7d`     | JWT token expiration                      |
| `ADMIN_INIT_PASSWORD`    | No       | (random) | Initial admin password                    |
| `LOG_LEVEL`              | No       | `info`   | Log level: debug, info, warn, error       |
| `TRAEFIK_DASHBOARD_AUTH` | Yes*     | -        | Traefik dashboard auth (production only)  |

*Required for production deployment with `docker-compose.prod.yml`

### Data Storage

Tutti stores data in Docker volumes:

| Volume              | Purpose                       |
| ------------------- | ----------------------------- |
| `tutti-data`        | SQLite database               |
| `tutti-uploads`     | Uploaded files (PDFs, images) |
| `tutti-letsencrypt` | SSL certificates (production) |

View volume locations:

```bash
docker volume inspect tutti-data
docker volume inspect tutti-uploads
```

### Resource Limits

Production deployment includes resource limits. Adjust in `docker-compose.prod.yml` if needed:

```yaml
deploy:
  resources:
    limits:
      cpus: '2'
      memory: 1G
```

---

## Backup & Restore

### Automated Backups

Set up a daily backup cron job:

```bash
# Edit crontab
crontab -e

# Add daily backup at 3 AM
0 3 * * * /path/to/tutti/scripts/backup.sh --docker /path/to/backups >> /var/log/tutti-backup.log 2>&1
```

### Manual Backup

```bash
# Create backup
./scripts/backup.sh --docker

# Or specify backup location
./scripts/backup.sh --docker /mnt/backups
```

Backups are saved as `tutti-backup-YYYYMMDD-HHMMSS.tar.gz` and include:

- SQLite database
- All uploaded files
- Backup metadata

### Restore from Backup

```bash
# Stop the application
docker compose down

# Restore backup
./scripts/restore.sh backups/tutti-backup-20240101-120000.tar.gz --docker

# Start the application
docker compose up -d
```

### Offsite Backups

Sync backups to remote storage:

```bash
# To S3-compatible storage
aws s3 sync /path/to/backups s3://your-bucket/tutti-backups/

# To another server
rsync -avz /path/to/backups/ user@backup-server:/backups/tutti/
```

---

## Updating

### Standard Update

```bash
# Pull latest changes
git pull

# Rebuild and restart
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build

# Check status
docker compose ps
docker compose logs -f
```

### Update with Backup

```bash
# Create backup first
./scripts/backup.sh --docker

# Pull and rebuild
git pull
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

### Rollback

If something goes wrong:

```bash
# Stop current version
docker compose down

# Checkout previous version
git checkout v1.0.0  # or specific commit

# Restore backup if needed
./scripts/restore.sh backups/tutti-backup-*.tar.gz --docker

# Rebuild and start
docker compose -f docker-compose.yml -f docker-compose.prod.yml up -d --build
```

---

## Troubleshooting

### Container Won't Start

```bash
# Check logs
docker compose logs backend
docker compose logs frontend

# Check container status
docker compose ps -a

# Restart containers
docker compose restart
```

### Database Issues

```bash
# Check database file
docker compose exec backend ls -la /app/data/

# Check database integrity
docker compose exec backend sqlite3 /app/data/tutti.db "PRAGMA integrity_check;"
```

### SSL Certificate Issues

```bash
# Check Traefik logs
docker compose logs traefik

# Force certificate renewal
docker compose exec traefik rm /letsencrypt/acme.json
docker compose restart traefik
```

### Out of Disk Space

```bash
# Check disk usage
df -h

# Clean Docker resources
docker system prune -a

# Check volume sizes
docker system df -v
```

### Health Check Failures

```bash
# Check health endpoint
curl http://localhost:3001/api/health

# Detailed health check (requires auth)
curl -H "Authorization: Bearer $TOKEN" http://localhost:3001/api/health/detailed
```

### Reset Admin Password

```bash
# Connect to database
docker compose exec backend sqlite3 /app/data/tutti.db

# In SQLite shell:
UPDATE users SET password_hash = '$2b$10$...' WHERE email = 'admin@example.com';
.quit
```

Or set `ADMIN_INIT_PASSWORD` in `.env` and restart (only works if user doesn't exist).

---

## Security Recommendations

1. **Keep Docker and the system updated**

   ```bash
   sudo apt update && sudo apt upgrade -y
   docker compose pull
   ```

2. **Use a firewall**

   ```bash
   sudo ufw allow 22/tcp   # SSH
   sudo ufw allow 80/tcp   # HTTP (redirects to HTTPS)
   sudo ufw allow 443/tcp  # HTTPS
   sudo ufw enable
   ```

3. **Regular backups** - Set up automated daily backups

4. **Monitor logs** - Check for suspicious activity

   ```bash
   docker compose logs -f --tail=100
   ```

5. **Secure the Traefik dashboard** - Use strong password or disable in production

---

## Getting Help

- **GitHub Issues**: [github.com/ruudsl/tutti/issues](https://github.com/ruudsl/tutti/issues)
- **Documentation**: [github.com/ruudsl/tutti/wiki](https://github.com/ruudsl/tutti/wiki)

---

## License

Tutti is released under the MIT License. See [LICENSE](../LICENSE) for details.
