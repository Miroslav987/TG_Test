import { PrismaClient } from '@prisma/client';
export * from '@prisma/client';
export const prisma = new PrismaClient();
export * from './ai'; 
export * from './telegram';