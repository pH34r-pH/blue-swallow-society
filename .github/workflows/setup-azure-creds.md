# Azure Credentials Setup

az ad sp create-for-rbac   --name blue-swallow-deployer   --role contributor   --scopes /subscriptions/<SUB_ID>   --sdk-auth

Copy output JSON → add to GitHub secret:
AZURE_CREDENTIALS
