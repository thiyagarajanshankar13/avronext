/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  poweredByHeader: false,
  experimental: {
    serverActions: { bodySizeLimit: '4mb' },
  },
}

export default nextConfig
