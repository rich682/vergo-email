/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    serverActions: {
      bodySizeLimit: '10mb',
    },
    serverComponentsExternalPackages: ['duckdb'],
  },
  // TypeScript checking during build (can be slow, Vercel uses SWC which is faster)
  typescript: {
    // Temporarily ignore build errors to isolate deployment cancellation issue
    ignoreBuildErrors: true,
  },
  // ESLint checking during build
  eslint: {
    // Temporarily ignore lint errors to isolate deployment cancellation issue
    ignoreDuringBuilds: true,
  },
  // Removed 'output: standalone' - not needed for Vercel

  // Image optimization
  images: {
    formats: ['image/avif', 'image/webp'],
    minimumCacheTTL: 60,
  },

  // Compression
  compress: true,

  // Performance optimizations
  poweredByHeader: false,
  
  // Bundle analyzer exclusion
  webpack: (config, { dev, isServer }) => {
    // Exclude bundle analyzer from production builds
    if (!dev && !isServer) {
      config.optimization = {
        ...config.optimization,
        minimize: true,
      }
    }
    return config
  },

  // Headers for security and performance
  async headers() {
    return [
      {
        source: '/(.*)',
        headers: [
          {
            key: 'X-Content-Type-Options',
            value: 'nosniff',
          },
          {
            key: 'X-Frame-Options',
            value: 'DENY',
          },
          {
            key: 'X-XSS-Protection',
            value: '1; mode=block',
          },
        ],
      },
    ]
  },

  // Redirects for legacy routes to new Jobs/Checklist flow
  async redirects() {
    return [
      {
        source: '/dashboard/compose',
        destination: '/dashboard/jobs',
        permanent: false, // Use 307 to allow rollback if needed
      },
      {
        source: '/dashboard/tasks',
        destination: '/dashboard/jobs',
        permanent: false,
      },
      {
        source: '/dashboard/tasks/:id',
        destination: '/dashboard/jobs',
        permanent: false,
      },
    ]
  },
}

module.exports = nextConfig
