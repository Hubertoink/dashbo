# Build SvelteKit (static)
FROM node:20-alpine AS build
WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .
RUN npm run build

# Serve with nginx
FROM nginx:1.27-alpine

ENV API_PROXY_PASS=http://backend:3000/
ENV API_PROXY_HOST=backend

# Use nginx's built-in template envsubst support.
# The entrypoint renders /etc/nginx/templates/*.template -> /etc/nginx/conf.d/*.conf at container start.
COPY nginx.conf /etc/nginx/templates/default.conf.template
RUN rm -rf /usr/share/nginx/html/*
COPY --from=build /app/build /usr/share/nginx/html

EXPOSE 80
