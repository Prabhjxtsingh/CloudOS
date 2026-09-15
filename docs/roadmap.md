# CloudOS Roadmap

## Phase 1 — Proof of concept

Goal: get a remote desktop running from a browser.

Tasks:
- Provision a Linux VM
- Set up a remote desktop environment
- Capture the VM display
- Stream frames to browser via WebRTC
- Send mouse and keyboard events back to the VM
- Test local connectivity

Success criteria:
- User can open a browser
- Connect to the server
- See the desktop
- Move the mouse
- Type text
- Open a file

## Phase 2 — Web desktop shell

Add:
- [x] login screen
- [x] taskbar
- [x] app launcher
- [x] window manager foundation
- [x] file manager view
- [x] settings panel
- [x] terminal window
- [x] text editor window

Status: in progress. The local shell now has launchable application windows, taskbar restore and close controls, terminal commands, editor persistence, a searchable launcher, dragging, native resize, and keyboard shortcuts. The next platform stage is the S3-compatible storage provider.

Window behavior milestone: dragging and native resize are available, and `Alt+Tab`, `Ctrl+Space`, `Ctrl+W`, and `Ctrl+Alt+T` provide keyboard window control.

## Phase 3 — Storage and session persistence

Add:
- [x] personal storage foundation
- [x] upload/download support
- [x] create/rename/delete files and folders
- [x] session persistence across reconnects
- [x] consistent file list after server restart
- [x] lightweight file version history
- [x] nested folder paths
- [x] share links with view/edit permission
- [x] restore previous versions
- [x] Trash and restore workflow
- [x] read-only share enforcement
- [x] expiring share links
- [x] revocable share links
- [x] permanent deletion from Trash
- [x] local object storage for file contents
- [x] S3-compatible object storage provider
- [x] configurable Trash retention and background cleanup
- [x] high-entropy share tokens and public-share rate limiting
- [x] request body and file-name validation limits
- [x] transactional SQLite metadata store with JSON migration

Status: in progress. Metadata uses a transactional SQLite store with JSON migration while file contents use a selectable local or S3-compatible provider. The next Phase 3 increment is PostgreSQL support for multi-instance concurrency.

Realtime foundation: the browser subscribes to server-sent events, so file creation, file edits, settings changes, and session changes are broadcast to connected CloudOS clients immediately.

## Phase 4 — Application architecture

Add:
- app install/removal flow
- application metadata service
- file associations
- permissions model
- process visibility

Business MVP foundation:
- [x] organization identity
- [x] team members and roles
- [x] admin usage summary
- [x] audit event trail
- [x] password authentication and signed sessions
- [x] authenticated API route protection
- [x] owner/admin role enforcement for organization administration
- [x] login and authenticated API rate limiting
- [ ] MFA
- [ ] organization-level storage permissions
- [ ] application policy management

Status: in progress. CloudOS now has password authentication, signed expiring sessions, protected API routes, persisted organization membership, owner/admin/member/viewer roles, admin metrics, and audit events. MFA, VM isolation, billing, SSO, and compliance remain infrastructure milestones rather than local prototype features.

## Phase 5 — Multi-user virtualization

Add:
- isolated VM per user
- per-user resource limits
- central session registry
- load balancing between hosts

## Phase 6 — Multi-device access

Add:
- same account on laptop, phone, tablet
- synced file access
- smooth session reconnect

## Phase 7 — Advanced cloud features

Add:
- VM autoscaling
- migration support
- static/dynamic resource pooling
- GPU acceleration for heavy workloads

## Phase 8 — Custom kernel exploration

Only after cloud platform is stable.

Goals:
- bootloader
- process manager
- scheduler
- memory manager
- filesystem
- device drivers
- remote execution integration

## Phase 9 — Final CloudOS version

Merge your remote cloud platform with your custom kernel or OS experiments into a single project narrative.

## Recommended milestone to target first

The best first milestone is:

> Linux VM running in the server -> desktop capture -> browser streaming -> input feedback -> working remote desktop

That single loop proves the system architecture and gives you a strong foundation for the rest of the project.
