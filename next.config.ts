import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  // Deployment ships the standalone server (docs/stack-technique.md §8).
  output: 'standalone',
  // `pg` is a native driver: never bundle it into the server output.
  serverExternalPackages: ['pg'],
}

export default nextConfig
