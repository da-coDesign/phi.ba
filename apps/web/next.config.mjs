const nextConfig = {
  reactStrictMode: true,
  transpilePackages: ["@phi-ba/contracts", "@phi-ba/shared", "@phi-ba/api"],
  webpack(config) {
    config.resolve.extensionAlias = {
      ...config.resolve.extensionAlias,
      ".js": [".ts", ".tsx", ".js", ".jsx"]
    };
    return config;
  }
};

export default nextConfig;
