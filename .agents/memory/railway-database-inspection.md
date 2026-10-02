---
name: Railway database inspection
description: Read-only production checks require separate access from Replit development queries.
---

The connected Railway MCP uses OAuth and returns variable names only, not database connection values. Its Railway Agent does not provide SQL execution. Replit database queries do not inspect Railway production.

**Why:** A safety check found the requested live pool absent from development, while neither Railway inspection nor its variable listing provided SQL access. Empty development results are not evidence that production has no affected records.

**How to apply:** For production data safety checks, use existing authorized database access or request a read-only export limited to the relevant fields. Do not change identifiers based only on development data, create infrastructure to bypass the access limitation, or ask for credentials in chat.