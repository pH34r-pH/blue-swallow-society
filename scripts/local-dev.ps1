Write-Host "Starting Azure Static Web Apps local emulator..."
Write-Host "Optional: set BACKEND_API_BASE_URL in your shell before starting future Cybermap proxy routes"
npx @azure/static-web-apps-cli start app --api-location api
