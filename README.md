# Personal Site Starter on Azure Static Web Apps + VM Echo Backend

This starter repo gives you:

- A **publicly accessible website** on **Azure Static Web Apps**
- **GitHub Actions CI/CD** for the frontend + managed API
- A small **Azure Functions proxy API** exposed as `/api/echo`
- An **Ubuntu VM** that hosts a simple **echo service**
- A clean place to add **local model experiments** later on the VM
- Documentation to evolve toward **Microsoft Entra External ID** for customer sign-up/sign-in later

## Architecture

```text
Browser
  ↓
Azure Static Web App (public frontend)
  ↓
/api/echo (managed Azure Functions proxy)
  ↓
VM-hosted echo service on Ubuntu
```

The browser never calls the VM directly in the sample app. The frontend calls the Static Web App API, and the API proxies the request to the VM.

---

## Repo Layout

```text
.
├── .github/workflows/
│   ├── deploy-static-web-app.yml
│   └── infra-whatif.yml
├── api/
│   ├── echo/
│   │   ├── function.json
│   │   └── index.js
│   └── profile/
│       ├── function.json
│       └── index.js
├── app/
│   ├── index.html
│   ├── main.js
│   ├── styles.css
│   └── staticwebapp.config.json
├── docs/
│   ├── architecture.md
│   ├── ai-options-and-budget.md
│   ├── external-id-setup-checklist.md
│   └── vm-echo-wiring.md
├── infra/
│   ├── main.bicep
│   ├── main.parameters.json
│   └── vm-echo-lab.bicep
└── scripts/
    ├── local-dev.ps1
    ├── print-next-steps.sh
    └── wireup-backend-url.sh
```

## What the website does

The home page includes:
- sign in / sign out buttons
- a protected profile test
- an **Echo Lab** section

The Echo Lab sends a message to:
- `GET /api/echo?msg=hello`

The Azure Function proxy forwards the request to the VM echo service using the app setting:
- `BACKEND_ECHO_BASE_URL`

Example value:

```text
http://<vm-public-ip>:8080
```

## Deployment sequence

### 1) Create your Git repo manually

```bash
git init
git checkout -b main
```

### 2) Create your Azure Static Web App
Use the Azure portal and point it to this repo.

Set:
- **Plan**: Standard
- **App location**: `app`
- **API location**: `api`
- **Output location**: blank

Then add the GitHub secret:
- `AZURE_STATIC_WEB_APPS_API_TOKEN`

### 3) Deploy the VM echo backend
Deploy the Bicep file in `infra/vm-echo-lab.bicep` into a resource group.

### 4) Wire the Static Web App to the VM
Set the Static Web App application setting:
- `BACKEND_ECHO_BASE_URL=http://<vm-public-ip>:8080`

## Notes on security

This scaffold is intentionally simple so you can focus on experiments.

For the VM starter, the echo service listens on a public IP and port 8080 so the integration is easy to understand and validate. That is **good for experiments**, but not the hardened end state.

The next hardening steps would be:
- remove the VM public IP or restrict it tightly
- use a private network path
- keep the browser calling the Static Web App API instead of the VM directly
- keep platform-managed auth and routing at the edge

## AI path

If you want to keep **everything under Azure credits only**, the lowest-risk approach is:
1. **Use local/open models on the VM** for experimentation
2. **Use Azure OpenAI pay-as-you-go** only for selective calls
3. Avoid provisioned throughput and fine-tuned hosting early
