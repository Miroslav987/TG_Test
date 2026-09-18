FROM node:20-alpine

WORKDIR /app

# 1. Копируем файлы зависимостей
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY bot/package*.json ./bot/
COPY admin/package*.json ./admin/

# 2. Устанавливаем пакеты (выполнится один раз при сборке)
RUN npm install

# 3. Копируем весь исходный код
COPY . .

# 4. Генерируем Prisma Client
RUN npx prisma generate --schema=shared/prisma/schema.prisma

# 5. Принимаем переменные для сборки Next.js
ARG NEXT_PUBLIC_BOT_USERNAME
ARG NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_BOT_USERNAME=$NEXT_PUBLIC_BOT_USERNAME
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

# 6. Собираем админку Next.js (самый тяжелый процесс для Pentium, но выполнится лишь раз!)
RUN npm run build --workspace=admin