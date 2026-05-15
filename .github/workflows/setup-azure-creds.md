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

| Secret                  | Value                                                |
| ----------------------- | ---------------------------------------------------- |
| `AZURE_CLIENT_ID`       | `appId` from step 1                                  |
| `AZURE_TENANT_ID`       | `tenant` from step 1                                 |
| `AZURE_SUBSCRIPTION_ID` | Your subscription GUID                               |
| `VM_SSH_PUBLIC_KEY`     | Single-line OpenSSH public key for the VM admin user |

The deploy workflow fetches the Static Web Apps deployment token at runtime via
the OIDC-authenticated Azure CLI session (`az staticwebapp secrets list`), so
**no `AZURE_STATIC_WEB_APPS_API_TOKEN` secret is required**. Any pre-existing
`AZURE_STATIC_WEB_APPS_API_TOKEN` or legacy `AZURE_CREDENTIALS` (SDK-auth JSON)
secrets can be deleted.

### Generating `VM_SSH_PUBLIC_KEY`

The Bicep template refuses to create the VM with an empty `keyData`, so this
secret must be populated **before** the first deployment run.

```bash
# Linux / macOS / WSL
ssh-keygen -t ed25519 -C "blue-swallow-vm" -f ~/.ssh/blue-swallow-vm -N ""
cat ~/.ssh/blue-swallow-vm.pub
```

```powershell
# Windows PowerShell
ssh-keygen -t ed25519 -C "blue-swallow-vm" -f $HOME\.ssh\blue-swallow-vm -N '""'
Get-Content $HOME\.ssh\blue-swallow-vm.pub
```

Copy the single-line output (starts with `ssh-ed25519 AAAA...`) into the
`VM_SSH_PUBLIC_KEY` repo secret. Keep the matching private key
(`blue-swallow-vm`) somewhere safe — you'll need it to `ssh azureuser@<vm-ip>`.

The deploy workflow runs a `Validate SSH public key format` step before calling
`az deployment group create`; an empty or malformed secret fails fast with a
clear error instead of producing the
`InvalidParameter: linuxConfiguration.ssh.publicKeys.keyData` failure deep in
the Bicep deployment.
