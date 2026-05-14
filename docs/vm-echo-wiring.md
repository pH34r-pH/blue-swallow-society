# VM echo wiring

## VM service
The VM bootstrap creates a tiny Python HTTP service that responds to:
- `GET /echo?msg=hello`

## Static Web App proxy function
The repo exposes:
- `GET /api/echo?msg=hello`

The function reads:
- `BACKEND_ECHO_BASE_URL`

and forwards to:
```text
${BACKEND_ECHO_BASE_URL}/echo?msg=hello
```

## App setting example
```text
BACKEND_ECHO_BASE_URL=http://20.20.20.20:8080
```
