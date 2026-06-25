# Tutti API Postman Collection

This directory contains a Postman collection for the Tutti (Harmonie) music association management API.

## Contents

- `tutti-api.postman_collection.json` - The main Postman collection with all API endpoints

## Importing the Collection

### In Postman Desktop App

1. Open Postman
2. Click **Import** in the top left
3. Drag and drop `tutti-api.postman_collection.json` or click **Upload Files** and select it
4. Click **Import** to confirm

### In Postman Web

1. Go to [Postman Web](https://go.postman.co/)
2. Click **Import** in your workspace
3. Upload the collection file
4. Click **Import** to confirm

## Setting Up the Environment

The collection includes built-in variables that you can configure:

### Collection Variables

| Variable | Default Value | Description |
|----------|---------------|-------------|
| `baseUrl` | `http://localhost:3001/api` | Base URL for the API |
| `token` | (empty) | JWT authentication token (auto-populated on login) |

### Updating Variables

1. Click on the collection name **Tutti API** in the sidebar
2. Go to the **Variables** tab
3. Update the **Current value** column with your environment-specific values:
   - For local development: `http://localhost:3001/api`
   - For staging: `https://staging.your-domain.com/api`
   - For production: `https://your-domain.com/api`

## Authentication

The API uses JWT (JSON Web Token) authentication. Most endpoints require authentication.

### How to Authenticate

1. Open the **Auth > Login** request
2. Update the request body with valid credentials:
   ```json
   {
     "email": "your-email@example.com",
     "password": "your-password"
   }
   ```
3. Send the request
4. On successful login, the token is automatically saved to the `token` collection variable
5. All subsequent requests will use this token for authentication

### Token Auto-Save

The Login request includes a test script that automatically saves the JWT token to the collection variables. You don't need to manually copy the token.

### MFA (Multi-Factor Authentication)

If MFA is enabled for your account:
1. First login attempt will return `{ "requiresMfa": true }`
2. Include the MFA code in your second login attempt:
   ```json
   {
     "email": "your-email@example.com",
     "password": "your-password",
     "mfaCode": "123456"
   }
   ```

## Available Endpoints

The collection is organized into the following folders:

### Auth
- Login / Logout
- Password management (change, forgot, reset)
- MFA setup and management

### Users
- CRUD operations for user management (admin only)
- User directory (member lookup)
- Profile photo management
- GDPR data export

### Music Pieces
- List and search music pieces
- Upload PDFs (single and bulk via ZIP)
- Download music piece files
- Manage title metadata (YouTube links, grades, genres)

### Rehearsals
- Schedule management
- Default days (recurring schedule)
- Generate rehearsals from defaults
- Recurring rehearsals with RRULE
- Attendance tracking and summaries

### Concerts
- Concert CRUD operations
- Program management
- Concert types configuration
- Statistics and history
- Attendance prediction
- Buma/Stemra export

### Tickets
- View available tickets (public)
- Create ticket orders (public)

### Settings
- Association settings (name, display name)
- Theme customization
- Logo management
- SMTP email configuration

## Role-Based Access

Different endpoints require different roles:

| Role | Access Level |
|------|--------------|
| `admin` | Full access to all endpoints |
| `music_committee` | Can manage music pieces, concerts, rehearsals |
| `conductor` | Can manage rehearsals |
| `member` | Read access to their own data, limited write access |

## Common Response Codes

| Code | Description |
|------|-------------|
| 200 | Success |
| 201 | Created |
| 400 | Bad Request - Invalid input |
| 401 | Unauthorized - Not authenticated |
| 403 | Forbidden - Insufficient permissions |
| 404 | Not Found |
| 409 | Conflict - Resource already exists |
| 429 | Too Many Requests - Rate limited |
| 500 | Internal Server Error |

## Rate Limiting

The API implements rate limiting:
- Login: 5 attempts per 15 minutes per IP
- Password reset: 3 attempts per hour per email
- General API: Standard rate limits apply

## Tips

### Testing File Uploads

For endpoints that accept file uploads (music pieces, logos, photos):
1. In Postman, select the **Body** tab
2. Choose **form-data**
3. For file fields, change the type from "Text" to "File"
4. Click **Select Files** to choose your file

### Viewing Response Data

Many endpoints return paginated data. The response includes:
```json
{
  "data": [...],
  "total": 100,
  "page": 1,
  "pageSize": 25,
  "totalPages": 4
}
```

### Using Path Variables

For endpoints with path parameters (e.g., `/users/:id`):
1. The parameter is shown as `:id` in the URL
2. Go to the **Params** tab
3. Update the value in the **Path Variables** section

## Support

For API documentation, see the Swagger docs at `/api/docs` when the server is running in development mode.
