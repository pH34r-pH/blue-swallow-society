export const APPROVED_AZURE_MTLS_SMOKE_HOST =
  'blue-swallow-vm-ob74vubvzwd7u.westus2.cloudapp.azure.com';

export function parseAzureMtlsSmokeOrigin(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('BSS_AZURE_MTLS_SMOKE_ORIGIN must be an absolute HTTPS URL');
  }

  if (parsed.protocol !== 'https:'
      || parsed.hostname.toLowerCase() !== APPROVED_AZURE_MTLS_SMOKE_HOST
      || parsed.port !== '8443'
      || parsed.pathname !== '/'
      || parsed.search
      || parsed.hash
      || parsed.username
      || parsed.password) {
    throw new Error('BSS_AZURE_MTLS_SMOKE_ORIGIN must be the exact approved public Azure mTLS origin on port 8443');
  }

  return parsed;
}
