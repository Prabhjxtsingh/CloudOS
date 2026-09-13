# CloudOS Architecture

## 1. System overview

CloudOS is designed around a central principle: the user interacts with a thin client while the operating system and applications remain hosted on a remote server.

```text
Client (Laptop / Phone / Browser)
        |
        | keyboard, mouse, touch
        v
Web Client / Remote UI
        |
        | WebSocket + WebRTC
        v
Cloud Session Layer
        |
        +--> Authentication
        +--> Session manager
        +--> VM placement
        +--> Desktop stream control
        v
Virtual Machine / Remote OS
        |
        +--> Linux desktop or custom OS
        +--> app execution
        +--> filesystem access
        +--> screen capture
        v
Cloud storage + metadata backend
```

## 2. Responsibilities

### Client side
- Display desktop frames
- Send keyboard and mouse input
- Render app windows
- Handle connection state and reconnection

### Server side
- Create and manage user VMs
- Maintain session lifecycle
- Capture display output
- Forward input events to the VM
- Provide persistent storage and user metadata

### Storage
- User data and home directories
- Desktop, documents, downloads
- App state and settings

## 3. Key components

### Authentication service
- User login and registration
- Session token issuance
- MFA support for future security hardening

### Session manager
- Keep a VM alive after disconnect
- Restore a user session on reconnect
- Track active devices

### VM manager
- Allocate VMs per user or per group
- Start, stop, and monitor VM health
- Enforce quota and resource limits

### Desktop capture pipeline
```text
VM GUI
  -> Frame buffer
  -> Screen capture
  -> Encoder (H.264 / VP9 / AV1)
  -> WebRTC stream
  -> Browser client
```

### Input pipeline
```text
Browser input event
  -> WebSocket or WebRTC channel
  -> Input broker
  -> VM injection layer
  -> Mouse / keyboard event delivery
```

## 4. MVP design

For the first prototype, the system should be simple and reliable:

- One Linux VM per user
- Browser-based client
- WebSocket signaling
- Remote desktop stream via WebRTC
- Local persistent storage or mounted file share
- Minimal API layer for login and VM session orchestration

## 5. Security concerns

Because the server executes user programs, the system must take isolation seriously:

- Per-user VM isolation
- Separate network namespaces or bridged networking rules
- File permission boundaries
- TLS for all client-facing traffic
- Strong credential handling
- Session revocation and timeout logic

## 6. Scaling path

Later versions can expand into:

- Multi-user support
- Per-user VM pools
- Live migration
- Auto-scaling of VM hosts
- GPU-backed rendering
- Distributed object storage
- Custom kernel development

## 7. Why this is a strong project

This architecture spans multiple major CS areas:

- Operating systems
- Virtualization
- Cloud infrastructure
- Networking
- Video encoding and streaming
- UI and browser application design
- Security and access control

## 8. Recommended first milestone

Build a working pipeline:

```text
Browser -> WebRTC -> server -> Linux VM -> desktop capture -> WebRTC -> browser
```

Then add:

- mouse input
- keyboard input
- connection lifecycle
- file persistence
- reconnect behavior
