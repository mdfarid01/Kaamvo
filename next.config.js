/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,

  webpack: (config, { isServer, webpack }) => {
    if (!isServer) {
      // pptxgenjs is one library for two runtimes: in Node it can write the
      // .pptx straight to disk and fetch a remote image, so it dynamically
      // imports node:fs and node:https. Webpack can't resolve a node: URL for
      // the browser and fails the build over it, and resolve.alias doesn't
      // apply to a request with a scheme — so the two are dropped outright.
      //
      // Nothing reachable from PDF to PPT touches them: it hands pptxgenjs data
      // URLs and takes a Blob back (see lib/pdf-to-ppt.ts), and both imports
      // sit behind the Node-only branches that produce a file path.
      config.plugins.push(
        new webpack.IgnorePlugin({ resourceRegExp: /^node:(fs|https)$/ }),
      );
    }

    return config;
  },
};

module.exports = nextConfig;
