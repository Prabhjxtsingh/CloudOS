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
