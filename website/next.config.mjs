import { createMDX } from 'fumadocs-mdx/next';

const withMDX = createMDX();

/** @type {import('next').NextConfig} */
const config = {
  serverExternalPackages: ['@takumi-rs/image-response'],
  output: 'export',
  reactStrictMode: true,
  basePath: process.env.GITHUB_PAGES ? '/gnata-sqlite' : '',
  images: { unoptimized: true },
};

export default withMDX(config);
