/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Its Node loader reads a sibling WASM file at runtime; bundling hardcodes
  // the build machine's path, which does not exist in a deployed function.
  serverExternalPackages: ["tiny-secp256k1"],
  outputFileTracingIncludes: {
    "/*": ["./node_modules/tiny-secp256k1/lib/secp256k1.wasm"],
  },
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
