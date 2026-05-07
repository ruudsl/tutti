# Administration Guide

## Role Model

Tutti has two levels of administration:
1. **Association Admins** — Manage a single organization
2. **Super Admins** — Platform-level access to manage all organizations

### Association Roles

| Role | Permissions |
|---|---|
| `member` | View and download own sheet music, manage profile |
| `section_leader` | All member permissions + manage own instrument section |
| `conductor` | All member permissions + manage rehearsals and concert programs |
| `music_committee` | All conductor permissions + upload music, manage instruments, handle issues |
| `admin` | Full access to organization: member management, settings, backup/restore, configuration |

### Super Admin

Super admins have platform-level access and can:
- View and manage **all** organizations
- Create new organizations
- Manage subscription tiers and limits
- Add/remove other super admins
- View platform-wide activity logs

> **Important:** Super admin is separate from the `admin` role. A user can be an organization admin without being a super admin, and vice versa.

## Default Admin Account

On first start, an admin account is automatically created:
- **Email:** `admin@harmonie.nl`
- **Password:** Generated and shown in console output (or set via `ADMIN_INIT_PASSWORD`)

This user is automatically added as both an organization admin AND a super admin.

## Adding Super Admins

### Via Environment Variable

Set the `MAKE_SUPER_ADMIN` environment variable to promote a user:

```bash
# In Render/Vercel/Docker environment
MAKE_SUPER_ADMIN=user@example.com
```

After setting this variable, restart the backend. The user will be added as a super admin on startup.

### Via Database (Advanced)

If you have direct database access:

```sql
-- Find the user ID
SELECT id, email FROM users WHERE email = 'user@example.com';

-- Add as super admin
INSERT INTO super_admins (id, user_id, permissions) 
VALUES (lower(hex(randomblob(16))), 'user-id-here', '["all"]');
```

## Multi-Tenant Architecture

Tutti supports multiple organizations on a single installation. Each organization (association) has:
- Its own members, instruments, and orchestras
- Separate music library
- Independent settings and branding
- Optional music sharing with partner organizations

### Data Isolation

All data is filtered by `association_id` to ensure organizations cannot see each other's data:
- Users belong to one primary association
- Music pieces, rehearsals, concerts are scoped to associations
- API endpoints automatically filter by the user's association

### Multi-Association Access

Users can belong to multiple associations:
- Switch between associations via the association switcher in the header
- Each association has its own role for the user
- Switching associations issues a new JWT token

## Backup & Restore

### Creating Backups

Admins can create backups via Settings → Backup:
- Downloads a ZIP file containing the SQLite database and all uploaded files
- Recommended before major changes or updates

### Restoring Backups

To restore a backup:
1. Go to Settings → Backup
2. Upload the ZIP file
3. Confirm the restore (this overwrites all data!)

### Automated Backups

For production, set up automated backups:
- Use cron jobs to call the backup API endpoint
- Store backups in external storage (S3, Google Cloud Storage, etc.)

## Environment Variables

### Admin-Related Variables

| Variable | Description |
|---|---|
| `ADMIN_INIT_PASSWORD` | Set the initial admin password (instead of random generation) |
| `MAKE_SUPER_ADMIN` | Email of user to promote to super admin on startup |
| `JWT_SECRET` | **Required in production** — secret for signing JWT tokens |
| `JWT_EXPIRES_IN` | Token validity period (default: `7d`) |

### Security Variables

| Variable | Default | Description |
|---|---|---|
| `RATE_LIMIT_WINDOW_MS` | `900000` | Rate limit window in ms (15 min) |
| `RATE_LIMIT_MAX_REQUESTS` | `100` | Max requests per window |
| `AUTH_RATE_LIMIT_MAX_REQUESTS` | `5` | Max login attempts per window |

## Troubleshooting

### "Super Admin Rechten Vereist" on Multi-Association Page

This means your user is not in the `super_admins` table. Solutions:
1. Set `MAKE_SUPER_ADMIN=your@email.com` in environment variables and redeploy
2. Check backend logs for "Adding ... as super-admin" messages

### User Cannot See Organization Data After Switching

This can be caused by cached data. Solutions:
1. Hard refresh the browser (Ctrl+Shift+R)
2. Clear localStorage: `localStorage.clear()` in browser console
3. Log out and log back in

### Cannot Create Music Lists / Orchestras Not Showing

This is usually a caching issue after switching associations:
1. The frontend clears cache on switch, but a hard refresh may help
2. Check if orchestras exist for the current association in the database
