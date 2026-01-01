FROM node:20-alpine

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
