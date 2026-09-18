FROM node:20-alpine

WORKDIR /app

# Копирование манифестов
COPY package*.json ./
COPY shared/package*.json ./shared/
COPY bot/package*.json ./bot/
COPY admin/package*.json ./admin/

RUN npm install

COPY . .

# Прием аргументов для сборки Next.js
ARG NEXT_PUBLIC_BOT_USERNAME
ENV NEXT_PUBLIC_BOT_USERNAME=$NEXT_PUBLIC_BOT_USERNAME

EXPOSE 3000