# Server Layer

The server layer is responsible for session orchestration, VM management, user state, and remote desktop streaming.

## Planned responsibilities

- Authentication and authorization
- User session tracking
- VM lifecycle management
- Desktop frame capture
- Input forwarding
- File and storage coordination
- Resource monitoring

## Suggested components

```text
server/
├── api/
├── auth/
├── vm/
├── session/
├── storage/
├── websocket/
├── webrtc/
└── monitor/
```

## First implementation goal

Start with a single Linux VM and a minimal API that:

- creates a session
- starts the VM
- exposes a signaling endpoint
- routes browser events to the VM input system
- streams desktop frames back to the browser

## Storage provider

File contents are accessed through `server/storage.js` rather than directly from request handlers. Development uses the local provider by default:

```text
CLOUDOS_STORAGE_PROVIDER=local
```

The metadata remains in `data/cloudos-state.json`, while content blobs live under `data/objects/`. A production S3-compatible adapter can now be added behind the same provider contract without changing the Files API.

## Authentication

API routes require an authenticated signed session cookie. Local development seeds the following account:

```text
Email: demo@cloudos.local
Password: demo
```

Set `CLOUDOS_AUTH_SECRET` to a long random value outside local development. Sessions expire according to `CLOUDOS_SESSION_TTL_SECONDS` (one day by default). The organization and admin endpoints require an owner or admin role.

S3-compatible storage is available with the following settings:

```text
CLOUDOS_STORAGE_PROVIDER=s3
CLOUDOS_S3_BUCKET=cloudos
CLOUDOS_S3_REGION=us-east-1
CLOUDOS_S3_ENDPOINT=http://localhost:9000       # optional for AWS; useful for MinIO
CLOUDOS_S3_ACCESS_KEY_ID=...
CLOUDOS_S3_SECRET_ACCESS_KEY=...
CLOUDOS_S3_PREFIX=objects                       # optional
CLOUDOS_S3_FORCE_PATH_STYLE=true                # required by many MinIO setups
CLOUDOS_TRASH_RETENTION_DAYS=30                 # optional Trash retention window
CLOUDOS_CLEANUP_INTERVAL_MS=3600000             # optional cleanup cadence
```

The adapter uses `HeadObject`, `GetObject`, `PutObject`, and `DeleteObject`, so the configured identity needs object read, write, and delete permissions for the bucket prefix.

Trash cleanup runs at startup and on the configured interval. Expired items are permanently removed from metadata and object storage, their share links are revoked, and a system audit event is recorded.
## Recommended language choice

For the first serious implementation, prefer:

- Go for backend services and concurrency
- Rust for performance-sensitive pieces if needed
- Python for prototypes and scripts

## Typical runtime flow

```text
Browser connects
    -> API validates session
    -> VM manager starts or resumes VM
    -> WebRTC signaling channel is established
    -> screen frames are captured from the VM
    -> frames are sent to browser
    -> user input is delivered back to VM
```
