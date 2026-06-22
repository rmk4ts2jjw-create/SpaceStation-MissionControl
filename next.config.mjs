/** @type {import('next').NextConfig} */
const nextConfig = {
  allowedDevOrigins: process.env.ALLOWED_DEV_ORIGINS
    ? process.env.ALLOWED_DEV_ORIGINS.split(",")
    : [],
  // Exclude archive directory from build
  typescript: {
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
