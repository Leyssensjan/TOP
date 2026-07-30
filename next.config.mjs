/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  headers: async () => [
    {
      // The service worker must never be cached, or offline updates never land.
      source: '/sw.js',
      headers: [{ key: 'Cache-Control', value: 'no-cache, no-store, must-revalidate' }],
    },
  ],
};

export default nextConfig;
