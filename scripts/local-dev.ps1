Write-Host "Starting Azure Static Web Apps local emulator..."
Write-Host "Optional: set BACKEND_ECHO_BASE_URL in your shell before starting"
npx @azure/static-web-apps-cli start app --api-location api
