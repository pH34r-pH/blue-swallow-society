# Azure Credentials Setup (OIDC, no secrets in GitHub)

Use a federated identity credential so GitHub Actions can authenticate without
storing a long-lived service-principal password.

## 1. Create the service principal

```bash
az ad sp create-for-rbac \
  --name blue-swallow-deployer \
  --role Contributor \
  --scopes /subscriptions/<SUB_ID>/resourceGroups/rg-blue-swallow
```

Capture `appId` (= client ID) and `tenant` from the output. The password is not
used with OIDC.

> Scope to the resource group, not the whole subscription, to follow least
> privilege. Create the RG first (`az group create`) if it does not yet exist.

## 2. Add the federated credential

```bash
az ad app federated-credential create \
  --id <APP_OBJECT_ID> \
  --parameters '{
    "name": "github-blue-swallow-main",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:<github-org-or-user>/blue-swallow-society:ref:refs/heads/main",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

Add a second credential for `workflow_dispatch` if you want manual runs from
feature branches.

## 3. GitHub secrets to set

| Secret                              | Value                                                |
| ----------------------------------- | ---------------------------------------------------- |
| `AZURE_CLIENT_ID`                   | `appId` from step 1                                  |
| `AZURE_TENANT_ID`                   | `tenant` from step 1                                 |
| `AZURE_SUBSCRIPTION_ID`             | Your subscription GUID                               |
| `AZURE_STATIC_WEB_APPS_API_TOKEN`   | Deployment token from the Static Web Apps resource   |
| `VM_SSH_PUBLIC_KEY`                 | Single-line OpenSSH public key for the VM admin user |

The legacy `AZURE_CREDENTIALS` (SDK-auth JSON) secret is no longer used and can
be deleted.
