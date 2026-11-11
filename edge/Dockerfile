# Minimum patched Node runtime. The verified fallback covers the delay between
# Node security downloads and official Docker tags. Other architectures fail
# closed until their official base image contains this security release.
FROM node:22-bookworm-slim AS node-security-base
RUN set -eu; \
    if node -e "const a=process.versions.node.split('.').map(Number),b='22.23.5'.split('.').map(Number);if(a[0]!==b[0]||a[1]<b[1]||(a[1]===b[1]&&a[2]<b[2]))process.exit(1)"; then exit 0; fi; \
    case "$(uname -m)" in \
      x86_64) archive="node-v22.23.5-linux-x64.tar.gz"; checksum="c54118104acc524633b5abe106bbf44a53126ec8b4e5fa105cb92b5d7de8a1a1" ;; \
      aarch64) archive="node-v22.23.5-linux-arm64.tar.gz"; checksum="8bd3dc69eee8f3f226315a80d7d1d4faccf217a4c8fae500168ac2e38f3bdba3" ;; \
      *) echo "Patched Node 22.23.5 base image required for this architecture" >&2; exit 1 ;; \
    esac; \
    apt-get update && apt-get install -y --no-install-recommends ca-certificates curl; \
    curl --fail --location --retry 3 -o /tmp/node-security.tar.gz "https://nodejs.org/dist/v22.23.5/$archive"; \
    echo "$checksum  /tmp/node-security.tar.gz" | sha256sum -c -; \
    tar -xzf /tmp/node-security.tar.gz --strip-components=2 -C /usr/local/bin "${archive%.tar.gz}/bin/node"; \
    rm /tmp/node-security.tar.gz; \
    node -e "const a=process.versions.node.split('.').map(Number),b='22.23.5'.split('.').map(Number);if(a[0]!==b[0]||a[1]<b[1]||(a[1]===b[1]&&a[2]<b[2]))process.exit(1)"

FROM node-security-base

WORKDIR /app

ARG EDGE_VERSION=
ARG EDGE_BUILD_SHA=

COPY package.json package-lock.json* ./
RUN npm install --omit=dev

COPY src ./src

ENV PORT=8787
ENV EDGE_VERSION=$EDGE_VERSION
ENV EDGE_BUILD_SHA=$EDGE_BUILD_SHA
EXPOSE 8787

CMD ["node", "src/index.js"]
