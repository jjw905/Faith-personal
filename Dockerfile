# syntax=docker/dockerfile:1.7

FROM node:22-bookworm-slim AS build

WORKDIR /app

ENV NEXT_TELEMETRY_DISABLED=1

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci --include=dev

COPY . .

ARG NEXT_SERVER_ACTION_ALLOWED_ORIGINS
ARG NEXT_PUBLIC_TEAM_FEATURE_ENABLED=true
ARG NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY=true
ARG NEXT_PUBLIC_REALTIME_FEATURE_ENABLED=false
ARG NEXT_PUBLIC_RECAPTCHA_SITE_KEY

ENV NEXT_SERVER_ACTION_ALLOWED_ORIGINS=${NEXT_SERVER_ACTION_ALLOWED_ORIGINS}
ENV NEXT_PUBLIC_TEAM_FEATURE_ENABLED=${NEXT_PUBLIC_TEAM_FEATURE_ENABLED}
ENV NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY=${NEXT_PUBLIC_TEAM_FEATURE_ADMIN_ONLY}
ENV NEXT_PUBLIC_REALTIME_FEATURE_ENABLED=${NEXT_PUBLIC_REALTIME_FEATURE_ENABLED}
ENV NEXT_PUBLIC_RECAPTCHA_SITE_KEY=${NEXT_PUBLIC_RECAPTCHA_SITE_KEY}

RUN --mount=type=secret,id=next_server_actions_encryption_key,required=true \
    export NEXT_SERVER_ACTIONS_ENCRYPTION_KEY="$(cat /run/secrets/next_server_actions_encryption_key)" && \
    npm run build

RUN npm prune --omit=dev

FROM node:22-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=8080

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates openssl \
    && rm -rf /var/lib/apt/lists/*

COPY --from=build /app/package.json /app/package-lock.json ./
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/.next ./.next
COPY --from=build /app/public ./public
COPY --from=build /app/prisma ./prisma
COPY --from=build /app/src ./src
COPY --from=build /app/scripts ./scripts
COPY --from=build /app/next.config.ts ./next.config.ts
COPY --from=build /app/tsconfig.json ./tsconfig.json

EXPOSE 8080

CMD ["npm", "run", "start"]
