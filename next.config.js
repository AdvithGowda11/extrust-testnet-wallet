/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
    };
    config.output.environment = {
      ...config.output.environment,
      asyncFunction: true,
    };
    config.experiments = {
      ...config.experiments,
      asyncWebAssembly: true,
      layers: true,
    };
    config.module.rules.push({ test: /\.wasm$/, type: "webassembly/async" });
    return config;
  },
};
module.exports = nextConfig;
