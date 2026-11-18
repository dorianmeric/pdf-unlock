# syntax=docker/dockerfile:1

# ---- build stage -------------------------------------------------------------
FROM node:22-alpine AS build

WORKDIR /app

# Install dependencies from the lockfile first so this layer is cached.
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

# Only the inputs Vite actually needs (see .dockerignore for the rest).
COPY index.html vite.config.js ./
COPY src ./src

RUN npm run build

# ---- runtime stage -----------------------------------------------------------
# This stage only collects the filesystem (nginx plus the entrypoint machinery).
# The image configuration is declared in the final stage below.
FROM nginx:1.29-alpine AS runtime

# The site config is a template: nginx cannot read env vars, so the image's
# /docker-entrypoint.d/20-envsubst-on-templates.sh renders ${PORT} into
# /etc/nginx/conf.d/default.conf at container start.
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html

# ---- image config ------------------------------------------------------------
# nginx:alpine declares `EXPOSE 80`, and a Dockerfile can only add exposed
# ports, never remove them, so `docker ps` would keep reporting "80/tcp" even
# though nothing listens there. Starting a new image from scratch and copying
# the runtime filesystem over drops that inherited port (and every other
# inherited setting), so the config is re-declared explicitly here.
FROM scratch
COPY --from=runtime / /

LABEL org.opencontainers.image.title="pdf-unlock" \
      org.opencontainers.image.description="Remove PDF password protection in the browser via qpdf-wasm" \
      org.opencontainers.image.source="https://github.com/jonas-strassel/pdf-unlock"

# Port nginx listens on inside the container. Override at runtime with -e PORT=...
ENV PORT=8191 \
    PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin

EXPOSE 8191

STOPSIGNAL SIGQUIT

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider "http://127.0.0.1:${PORT}/" || exit 1

ENTRYPOINT ["/docker-entrypoint.sh"]
CMD ["nginx", "-g", "daemon off;"]
