/** @type {import('next').NextConfig} */
const nextConfig = {
  serverExternalPackages: ["@sparticuz/chromium", "playwright-core", "puppeteer-core"]
};

export default nextConfig;
