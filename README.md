# CloudOS

CloudOS is a server-hosted operating system environment in which computation, storage, application execution, and graphical rendering happen remotely on cloud infrastructure. Users access the environment through a lightweight web client that sends keyboard, mouse, and touch input to the server while receiving a streamed desktop preview in return.

## Vision

The project combines:

- Operating systems
- Virtualization
- Cloud computing
- Computer networking
- Distributed systems
- Remote desktop streaming
- Web development
- Security and session management

## Core idea

The client is a thin interface. The real OS runs inside a server-side VM or container, and the desktop is captured and streamed to the browser using a low-latency protocol such as WebRTC.

## MVP

The first milestone is a working proof of concept:

1. User opens the browser
2. Logs in
3. Starts a CloudOS session
4. Sees a remote desktop
5. Moves the mouse and types
6. Opens an application
7. Creates a file
8. Disconnects and reconnects
9. Sees the same session state

## High-level architecture

```text
User Browser
    |
    | WebRTC / WebSocket
    v
API Gateway / Auth
    |
    v
Session Manager
    |
    +--> VM Manager
            |
            v
          Cloud VM
            |
            +--> Linux Desktop
            |
            +--> Frame Capture
            |
            +--> Input Injection
            |
            +--> Cloud Storage
```

## Recommended technology stack

### Client
- HTML / CSS / TypeScript
- React
- WebRTC
- WebSocket
- Canvas

### Server
- Linux
- Docker
- QEMU / KVM
- Go or Rust for backend services
- PostgreSQL
- Redis
- Nginx

### Infrastructure
- Docker Compose for local development
- GitHub Actions for CI/CD
- Optional: Cloud provider hosting later

## Repository structure

```text
CloudOS/
├── README.md
├── docs/
│   ├── architecture.md
│   └── roadmap.md
├── client/
│   └── README.md
├── server/
│   └── README.md
├── infrastructure/
│   └── docker/
│       ├── README.md
│       └── docker-compose.yml
├── apps/
├── scripts/
├── .gitignore
└── LICENSE
```

## Development order

1. Remote VM
2. Desktop capture and streaming
3. Input system
4. Browser-based desktop client
5. Session persistence
6. Cloud storage and file management
7. Multi-user architecture
8. Custom kernel work (later phase)

## Current status

The local prototype now includes a Phase 2 web desktop shell, Phase 3 persistence and realtime layers, and the first business workspace foundation. Searchable app launcher, application windows, server-backed apps, live settings, upload/download, file management, nested folders, share links, expiring/revocable permissions, version restore, Trash, permanent deletion, provider-backed local object storage, organization members, roles, admin metrics, and audit events are available. The next platform step is an S3-compatible storage adapter, then VM orchestration with WebRTC media streaming.
The local prototype now includes a Phase 2 web desktop shell, Phase 3 persistence and realtime layers, and the first business workspace foundation. Searchable app launcher, application windows, server-backed apps, password authentication, signed sessions, protected API routes, live settings, upload/download, file management, nested folders, share links, expiring/revocable permissions, version restore, Trash retention cleanup, permanent deletion, selectable local or S3-compatible object storage, organization members, roles, admin metrics, and audit events are available. The next platform step is durable metadata storage and MFA, then VM orchestration with WebRTC media streaming.

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm start
```

Then open `http://localhost:3000` in a browser.

## License

This project is intended for educational and research use. Add an appropriate license if you plan to publish it publicly.
