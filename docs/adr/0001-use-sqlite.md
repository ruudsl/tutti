# 1. Use SQLite as Database

Date: 2024-01-15

## Status
Accepted

## Context
The Tutti application needs a database to store music library data, user information, rehearsals, concerts, and member management data. The typical choices for a web application database are:

- **PostgreSQL**: Full-featured relational database, excellent for complex queries and high concurrency
- **MySQL/MariaDB**: Popular relational database with good performance
- **SQLite**: Embedded database, file-based, zero configuration

Key considerations for our use case:
- The application is designed for music associations (concert bands, brass bands) with typically 20-150 members
- Read-heavy workload: members browse sheet music, view schedules, check attendance
- Write operations are infrequent: uploading music, creating events, updating attendance
- Self-hosting should be simple for non-technical administrators
- Multi-tenant architecture with shared database approach

## Decision
We chose SQLite (using better-sqlite3 and sql.js) as our database engine.

Reasons for this decision:
1. **Zero configuration**: No separate database server to install, configure, or maintain
2. **Simple deployment**: Single file database that can be easily backed up and restored
3. **Excellent read performance**: SQLite is highly optimized for read operations, which matches our workload
4. **Low resource usage**: No separate process, minimal memory footprint
5. **Self-hosting friendly**: Non-technical users can deploy without database expertise
6. **Portability**: Database file can be moved between environments easily
7. **Sufficient for scale**: Music associations rarely exceed concurrent user counts that would stress SQLite

## Consequences

### Positive
- Simplified deployment process for self-hosted instances
- No database administration overhead
- Fast read operations for browsing music library
- Easy backup (just copy the database file)
- Lower hosting costs (no separate database service needed)

### Negative
- Limited write concurrency (one writer at a time, though reads can happen simultaneously)
- Not suitable for horizontal scaling across multiple servers
- No built-in replication or clustering
- Must be careful with long-running write transactions to avoid blocking

### Mitigations
- Use WAL (Write-Ahead Logging) mode for better concurrency
- Keep write transactions short
- Consider PostgreSQL migration path if scaling requirements change significantly
