#!/usr/bin/env bash
set -euo pipefail

cat <<'EOF'
Blue Swallow Society development:
  1. Work on public app/, api/, and vm/cybermap-api/ source here. Pull requests
     and main run credential-free Society public CI on GitHub-hosted runners.
  2. The canonical site is https://blueswallow.ph34r.dev. Its Fleet parent
     delegation, Wardriver child DNS/SWA binding and VM mTLS hostname are
     documented in blue-swallow-wardriver/infra/dns/.
  3. Private Wardriver promotion will verify the exact Society main SHA, both
     public CI jobs and an independently hashed source archive. Track the
     migration in Wardriver #46/#47 and Society #52/#53.
  4. Until private parity is proven, use the manual, main-only Deploy Infra +
     App workflow only for explicit recovery. A full recovery can restore
     historical Caddy and Blob CORS settings; reapply and check Wardriver's
     SNI and release-cors overlays afterwards. Do not run old .net domain
     wiring or create subscription-wide public deployment credentials.
EOF
