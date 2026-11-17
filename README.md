# PDF Unlock

Remove password protection from PDF files entirely in your browser using WebAssembly.

**[Live Demo](https://pdf-unlock.jonas-strassel.de/)**

## Features

- Decrypt owner-password-protected PDFs (restricted permissions) without a password
- Decrypt user-password-protected PDFs with the correct password
- Shows encryption status and permission details before unlocking
- All processing runs client-side — files never leave your device

## Development

```bash
npm install
npm run dev
```

## Deployment

Pushes to `main` automatically deploy to GitHub Pages via the included workflow.

### Docker

```bash
./startDocker.sh        # docker compose up -d
# -> http://localhost:8191
```

Ports are set from the environment (shell or a `.env` file next to
`docker-compose.yml`):

| Variable         | Default | Meaning                                          |
| ---------------- | ------- | ------------------------------------------------ |
| `HOST_PORT`      | `8191`  | port published on the host                       |
| `CONTAINER_PORT` | `8191`  | port nginx listens on inside the container       |

`CONTAINER_PORT` is passed to the container as `PORT`; `nginx.conf.template` is
rendered with it on startup, so the same image can serve on any port:

```bash
HOST_PORT=9000 CONTAINER_PORT=8080 docker compose up -d --build
# or a single container
docker run -e PORT=8080 -p 9000:8080 pdf-unlock
```

## Built with

- [qpdf-wasm](https://github.com/neslinesli93/qpdf-wasm) — QPDF compiled to WebAssembly
- [Vite](https://vite.dev/)
