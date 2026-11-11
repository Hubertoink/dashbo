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
