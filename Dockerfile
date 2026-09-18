FROM node:20-alpine

WORKDIR /app

# Включаем pnpm, который встроен в современные версии Node.js
RUN corepack enable pnpm

# Копируем основные манифесты и lock-файл
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./

# Копируем package.json каждого проекта
COPY shared/package.json ./shared/
COPY bot/package.json ./bot/
COPY admin/package.json ./admin/

# Устанавливаем зависимости с помощью pnpm
RUN pnpm install --frozen-lockfile

# Копируем весь оставшийся код
COPY . .

# Генерируем клиент Prisma
RUN pnpm exec prisma generate --schema=shared/prisma/schema.prisma

# Принимаем переменные окружения для сборки Next.js
ARG NEXT_PUBLIC_BOT_USERNAME
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BOT_USERNAME=$NEXT_PUBLIC_BOT_USERNAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# Собираем админку через фильтр pnpm
RUN pnpm --filter admin run build