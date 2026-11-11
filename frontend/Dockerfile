# Minimum patched Node runtime. The verified fallback covers the delay between
# Node security downloads and official Docker tags. Other architectures fail
# closed until their official base image contains this security release.
FROM node:22-alpine AS node-security-base
RUN set -eu; \
    if node -e "const a=process.versions.node.split('.').map(Number),b='22.23.5'.split('.').map(Number);if(a[0]!==b[0]||a[1]<b[1]||(a[1]===b[1]&&a[2]<b[2]))process.exit(1)"; then exit 0; fi; \
    case "$(uname -m)" in \
      x86_64) archive="node-v22.23.5-linux-x64-musl.tar.gz"; checksum="83b8ba916eb22e89ba8274426a40f7aa0011c6e4c5ff77a5b03793f781a90786" ;; \
      *) echo "Patched Node 22.23.5 base image required for this architecture" >&2; exit 1 ;; \
    esac; \
    wget -qO /tmp/node-security.tar.gz "https://nodejs.org/dist/v22.23.5/$archive"; \
    echo "$checksum  /tmp/node-security.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/node-security.tar.gz --strip-components=2 -C /usr/local/bin "${archive%.tar.gz}/bin/node"; \
    rm /tmp/node-security.tar.gz; \
    node -e "const a=process.versions.node.split('.').map(Number),b='22.23.5'.split('.').map(Number);if(a[0]!==b[0]||a[1]<b[1]||(a[1]===b[1]&&a[2]<b[2]))process.exit(1)"

# Build SvelteKit (static)
FROM node-security-base AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:1.27-alpine

ENV API_PROXY_PASS=http://backend:3000/
ENV API_PROXY_HOST=backend
ENV CLIENT_MAX_BODY_SIZE=12m

# Use nginx's built-in template envsubst support.
# The entrypoint renders /etc/nginx/templates/*.template -> /etc/nginx/conf.d/*.conf at container start.
COPY nginx.conf /etc/nginx/templates/default.conf.template
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
