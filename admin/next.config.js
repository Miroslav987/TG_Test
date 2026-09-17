/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@standup/shared"],
  serverExternalPackages: ['@prisma/client'],
  typescript: { ignoreBuildErrors: true },
  allowedDevOrigins: ['overstay-ecology-cardinal.ngrok-free.dev'],
};

export default nextConfig;