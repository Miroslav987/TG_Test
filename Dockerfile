FROM node:20-slim

WORKDIR /app

# Установка OpenSSL для корректной работы Prisma
RUN apt-get update -y && apt-get install -y openssl

# Включаем pnpm
RUN corepack enable pnpm

# Копируем конфигурации монорепозитория
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
