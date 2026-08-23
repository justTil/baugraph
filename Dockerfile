# syntax=docker/dockerfile:1

# --- build ---------------------------------------------------------------
FROM node:26-alpine AS build
WORKDIR /app

# Set to "true" to build the self-hosted variant: drops the operator-specific
# Impressum/Legal links and shows a "self-hosted" marker instead.
ARG SELF_HOSTED=false
ENV SELF_HOSTED=$SELF_HOSTED

COPY package.json package-lock.json ./
RUN npm ci

COPY . .
RUN npm run build

# --- serve -----------------------------------------------------------------
FROM nginx:1.31.4-alpine AS serve

COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1/ || exit 1
