/** @type {import('next').NextConfig} */
const nextConfig = {
  // Говорим Next.js компилировать наш общий пакет
  transpilePackages: ["@standup/shared"],
  serverExternalPackages: ['@prisma/client'],
  // Игнорируем ошибки TS и ESLint при билде для ускорения разработки (опционально)
  eslint: { ignoreDuringBuilds: true },
  typescript: { ignoreBuildErrors: true }
};

export default nextConfig; // если файл .js, то: module.exports = nextConfig;