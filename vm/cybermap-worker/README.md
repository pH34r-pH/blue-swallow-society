# Cybermap worker VM service

Node 20 scaffold for background Cybermap jobs on the VM.

Initial jobs are placeholders until the database connection and product endpoint tasks land:
- Greenfeed polling.
- Cybermap cell materialization.

The worker emits structured JSON logs, has a configurable `pollIntervalMs`, and handles `SIGTERM` for clean systemd shutdown.
