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
FROM nginx:1.29-alpine AS runtime

LABEL org.opencontainers.image.title="pdf-unlock" \
      org.opencontainers.image.description="Remove PDF password protection in the browser via qpdf-wasm" \
      org.opencontainers.image.source="https://github.com/jonas-strassel/pdf-unlock"

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 8191

HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget -q --spider http://127.0.0.1/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
