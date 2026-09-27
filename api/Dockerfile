# Public Society Functions artifact. Microsoft maintains the Functions runtime base;
# released Society deployments use our immutable GHCR digest, not this moving tag.
FROM mcr.microsoft.com/azure-functions/node:4-node24

ENV AzureWebJobsScriptRoot=/home/site/wwwroot \
    AzureFunctionsJobHost__Logging__Console__IsEnabled=true

WORKDIR /home/site/wwwroot

COPY api/package.json api/package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --engine-strict

COPY api/ ./
