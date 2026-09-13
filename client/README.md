# Client Layer

The client layer should be lightweight and browser-first for the early prototype.

## Core responsibilities

- Login and session creation
- Display remote desktop stream
- Capture keyboard and mouse input
- Send input events to the server
- Reconnect gracefully after disconnects
- Support mobile and desktop browsers

## Suggested structure

```text
client/
├── app/
├── components/
│   ├── login/
│   ├── desktop/
│   ├── taskbar/
│   └── terminal/
├── hooks/
├── services/
│   ├── signaling.ts
│   ├── webrtc.ts
│   └── input.ts
└── styles/
```

## Recommended client stack

- React
- TypeScript
- Vite
- WebRTC API
- CSS or a UI library

## MVP client behavior

- Connect to the server
- Authenticate
- Open a remote desktop session
- Receive frame updates
- Send user input back to the server
- Handle reconnect and session restoration

## Design principle

The client is a portal to a remote environment, not a local desktop runtime. It should feel like a thin interface to a server-hosted system.
