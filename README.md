# Standup AI System

Комплексная система для проведения стендапов: Telegram-бот для сотрудников и веб-админка на Next.js для менеджеров.
Система умеет собирать планы на день, вечерние итоги, а также генерировать сводные отчёты с помощью ИИ Gemini.

## 🛠 Архитектура (Monorepo)
- `/bot` — Telegram-бот на библиотеке `grammY`.
- `/admin` — Веб-админка на `Next.js 14+` (App Router).
- `/shared` — Общая схема базы данных Prisma и TypeScript-типы.

---

## 🚀 Пошаговая инструкция по запуску

### 1. Подготовка сервисов и ключей
Для работы понадобятся 3 токена:
1. **Telegram Bot Token**:
   - Открой Telegram, найди бота [@BotFather](https://t.me/BotFather).
   - Отправь команду `/newbot`, задай имя и юзернейм.
   - Скопируй полученный `HTTP API Token`.
2. **PostgreSQL Database URL**:
   - Зарегистрируйся на [Neon.tech](https://neon.tech/) или [Supabase](https://supabase.com/) (оба сервиса бесплатны).
   - Создай новый проект базы данных (PostgreSQL).
   - Скопируй строку подключения (`Connection String`). Она выглядит примерно так: `postgresql://user:pass@host/dbname`.
3. **Gemini API Key**:
   - Зайди в [Google AI Studio](https://aistudio.google.com/).
   - Перейди в раздел `Get API key` и создай новый ключ.

### 2. Клонирование и установка зависимостей
Требуется Node.js v20+ и пакетный менеджер `pnpm`.
```bash
# Установка pnpm (если не установлен)
npm install -g pnpm

# Установка зависимостей во всех папках (корне)
pnpm install