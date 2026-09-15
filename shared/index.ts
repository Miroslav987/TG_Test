import { PrismaClient } from '@prisma/client';
export * from '@prisma/client';

// 3. Единый инстанс БД для всего монорепозитория
export const prisma = new PrismaClient();