# syntax=docker/dockerfile:1

# ABI_SPECS pins the four @hashpower/*-abi packages for this image, for
# example "@hashpower/oracle-abi@0.3.1 @hashpower/perps-abi@0.4.1 ...".
# deploy-mcp.yml resolves them from the npm dist-tag for the target
# environment (dev -> `dev`, main -> `latest`) so the same branch content
# serves both networks. Empty keeps the committed lockfile (local builds).
ARG ABI_SPECS=""

FROM node:24-alpine AS build
ARG ABI_SPECS
RUN corepack enable pnpm
WORKDIR /app
COPY package.json pnpm-lock.yaml ./
RUN if [ -n "$ABI_SPECS" ]; then \
      pnpm add $ABI_SPECS --ignore-scripts; \
    else \
      pnpm install --frozen-lockfile --ignore-scripts; \
    fi
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

FROM node:24-alpine
RUN apk add --no-cache tini && corepack enable pnpm
WORKDIR /app
# The build stage may have re-pinned the ABI packages. Install from its
# manifest so the runtime image ships the same versions it was built with.
COPY --from=build /app/package.json /app/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile --prod --ignore-scripts
COPY --from=build /app/dist ./dist
ENV HASHPOWER_TRANSPORT=http
ENV PORT=8080
USER node
EXPOSE 8080
ENTRYPOINT ["/sbin/tini", "--"]
CMD ["node", "dist/index.js"]
