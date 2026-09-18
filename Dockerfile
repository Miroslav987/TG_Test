FROM node:20-alpine

WORKDIR /app

# Установка необходимых библиотек для Prisma в Alpine Linux
RUN apk add --no-cache openssl libc6-compat

# Включаем pnpm
RUN corepack enable pnpm

# Копируем файлы зависимостей
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
COPY shared/package.json ./shared/
COPY bot/package.json ./bot/
COPY admin/package.json ./admin/

RUN pnpm install --frozen-lockfile

COPY . .

# Генерация Prisma Client
RUN pnpm exec prisma generate --schema=shared/prisma/schema.prisma

ARG NEXT_PUBLIC_BOT_USERNAME
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BOT_USERNAME=$NEXT_PUBLIC_BOT_USERNAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

RUN pnpm --filter admin run build
