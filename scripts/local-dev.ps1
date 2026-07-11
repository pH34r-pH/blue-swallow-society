Write-Host "Starting Azure Static Web Apps local emulator..."
Write-Host "Optional: set CYBERMAP_BACKEND_BASE_URL and CYBERMAP_BACKEND_TOKEN in your shell before starting Cybermap proxy routes"
npx @azure/static-web-apps-cli start app --api-location api
