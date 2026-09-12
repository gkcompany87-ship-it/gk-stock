FROM node:24-bookworm-slim AS base
ENV PNPM_HOME=/pnpm
ENV PATH=$PNPM_HOME:$PATH
RUN npm install --global pnpm@10.28.2
WORKDIR /app
FROM base AS build
COPY . .
# A reviewed pnpm-lock.yaml is a release prerequisite. Never use --no-frozen-lockfile here.
RUN test -f pnpm-lock.yaml && pnpm install --frozen-lockfile
RUN pnpm db:generate && pnpm exec turbo build --filter=@as-tino/api...
FROM base AS runtime
ENV NODE_ENV=production
ENV PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
ENV PDF_DISABLE_SANDBOX=false
RUN apt-get update && apt-get install -y --no-install-recommends chromium chromium-sandbox fonts-liberation ca-certificates \
 && rm -rf /var/lib/apt/lists/*
# Keep workspace symlinks and the CLI tools for the separate migration/bootstrap job.
# A smaller pruned runtime is a later optimization, after a lockfile is resolved.
COPY --from=build --chown=node:node /app /app
USER node
EXPOSE 4000
HEALTHCHECK --interval=20s --timeout=8s --start-period=30s --retries=3 CMD node -e "fetch('http://localhost:4000/api/v1/health/ready').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "apps/api/dist/main.js"]
