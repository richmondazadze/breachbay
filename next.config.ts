import type { NextConfig } from "next";
const nextConfig: NextConfig = {
  outputFileTracingExcludes: {
    "/*": [
      "./deployment/private/**/*", "./coordination/**/*", "./design/**/*", "./tools/**/*", "./tests/**/*",
      "./.env*", "./*.docx", "./*.md", "./deployment/**/*.md", "./spacetimedb/src/**/*.md",
    ],
  },
};
export default nextConfig;
