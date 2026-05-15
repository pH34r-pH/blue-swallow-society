You are working on the Blue Swallow Society project.

Architecture:
- Static Web App frontend
- Azure Functions API (/api)
- VM backend
- Azure OpenAI integration

Rules:
- NEVER call VM directly from frontend
- Always route through /api
- Keep costs minimal
- Prefer VM-first experimentation

Deployment:
- Infra is defined in /infra
- Deployments happen via GitHub Actions

Your job:
- Add features
- Fix infra
- Propose improvements
