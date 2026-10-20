import type { NextConfig } from 'next';

const config: NextConfig = {
  // The core package ships TypeScript source, not a build.
  transpilePackages: ['@kdan-social/core'],
};

export default config;
