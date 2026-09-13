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

Status: in progress. The local shell now has launchable application windows, taskbar restore and close controls, terminal commands, editor persistence, and a searchable launcher. The next Phase 2 increment is richer window behavior such as dragging, resize handles, and keyboard shortcuts.

## Phase 3 — Storage and session persistence

Add:
- personal storage
- upload/download support
- create/rename/delete folders
- session persistence across reconnects
- consistent user environment

## Phase 4 — Application architecture

Add:
- app install/removal flow
- application metadata service
- file associations
- permissions model
- process visibility

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
