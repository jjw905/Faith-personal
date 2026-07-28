FROM node:20-bookworm-slim

WORKDIR /app

RUN apt-get update \
    && apt-get install -y --no-install-recommends ffmpeg openssl \
    && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm ci

COPY tsconfig.json next-env.d.ts ./
COPY src ./src

CMD ["./node_modules/.bin/tsx", "--tsconfig", "tsconfig.json", "scripts/benchmark-stt-server.ts"]
