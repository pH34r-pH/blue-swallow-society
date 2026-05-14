{
  "routes": [
    { "route": "/account/*", "allowedRoles": ["authenticated"] },
    { "route": "/api/profile", "allowedRoles": ["authenticated"] },
    { "route": "/api/echo", "allowedRoles": ["anonymous", "authenticated"] },
    { "route": "/login", "redirect": "/.auth/login/aad" },
    { "route": "/logout", "redirect": "/.auth/logout" }
  ],
  "responseOverrides": {
    "401": { "statusCode": 302, "redirect": "/.auth/login/aad" }
  },
  "navigationFallback": {
    "rewrite": "/index.html",
    "exclude": ["/api/*", "/.auth/*"]
  },
  "globalHeaders": {
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "strict-origin-when-cross-origin",
    "X-Frame-Options": "DENY"
  }
}
