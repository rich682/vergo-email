const path = require('path')

/** @type {import('next').NextConfig} */
const nextConfig = {
  experimental: {
    // Allow importing from outside the admin-dashboard directory
    externalDir: true,
  },
  webpack: (config) => {
    // Resolve @prisma/client from the parent workspace
    config.resolve.alias['@prisma/client'] = path.resolve(__dirname, '../node_modules/@prisma/client')
    config.resolve.alias['.prisma/client'] = path.resolve(__dirname, '../node_modules/.prisma/client')
    return config
  },
}

module.exports = nextConfig
