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

The local prototype now includes a Phase 2 web desktop shell plus the first Phase 3 persistence layer. Searchable app launcher, application windows, taskbar controls, terminal commands, text editing, files, and settings are available; files and session metadata now survive a local server restart. The next platform step is to add real file content and replace the local session simulation with a VM and WebRTC media pipeline.

## Run locally

Requirements: Node.js 18 or newer.

```bash
npm start
```

Then open `http://localhost:3000` in a browser.

## License

This project is intended for educational and research use. Add an appropriate license if you plan to publish it publicly.
