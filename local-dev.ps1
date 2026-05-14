# Architecture decisions

## Why this shape?
This repo separates concerns:

- **Azure Static Web Apps** handles the public frontend and managed web edge.
- **Azure Functions proxy** gives you a stable `/api/*` surface.
- **Ubuntu VM** gives you a flexible sandbox for experiments, custom daemons, and local models.

## Data flow

```text
User browser
  → Static Web App frontend
  → /api/echo on the managed API layer
  → VM echo service
```
