import type { NextConfig } from "next";

const onNetlify = process.env.NETLIFY === "true";

function backendOrigin(): string {
  const configured = process.env.NAGARFLOW_BACKEND_URL?.trim();
  if (!onNetlify) {
    return configured?.replace(/\/$/, "") || "http://127.0.0.1:5000";
  }
  if (!configured) {
    throw new Error("Netlify requires NAGARFLOW_BACKEND_URL: set the running backend's HTTPS origin before deploying. See NETLIFY.md.");
  }

  let backend: URL;
  try {
    backend = new URL(configured);
  } catch {
    throw new Error("NAGARFLOW_BACKEND_URL must be an HTTPS origin without credentials, path, query or fragment.");
  }
  if (backend.protocol !== "https:" || backend.username || backend.password ||
      backend.pathname !== "/" || backend.search || backend.hash) {
    throw new Error("NAGARFLOW_BACKEND_URL must be an HTTPS origin without credentials, path, query or fragment.");
  }
  backend.hostname = backend.hostname.replace(/\.$/, "");
  const hostname = backend.hostname;
  if (hostname === "localhost" || hostname.endsWith(".localhost") ||
      hostname === "0.0.0.0" || hostname.startsWith("127.") ||
      hostname === "[::1]" || hostname === "[::]" || hostname === "[::ffff:0:0]" ||
      /^\[::ffff:7f[0-9a-f]{2}:[0-9a-f]+\]$/.test(hostname)) {
    throw new Error("Netlify cannot reach a loopback backend. Use the deployed backend's public HTTPS origin.");
  }
  for (const key of ["URL", "DEPLOY_URL", "DEPLOY_PRIME_URL"]) {
    const frontend = process.env[key];
    if (!frontend) continue;
    const frontendUrl = new URL(frontend);
    frontendUrl.hostname = frontendUrl.hostname.replace(/\.$/, "");
    if (backend.origin === frontendUrl.origin) {
      throw new Error("NAGARFLOW_BACKEND_URL points to this Netlify frontend, which would create a proxy loop. Use the backend's HTTPS origin.");
    }
  }
  return backend.origin;
}

const backend = backendOrigin();

const nextConfig: NextConfig = {
  devIndicators: false,
  output: onNetlify ? undefined : "standalone",
  async rewrites() {
    return [ { source: "/api/:path*", destination: `${backend}/api/:path*` }, { source: "/uploads/:path*", destination: `${backend}/uploads/:path*` } ];
  },
  images: {
    unoptimized: true,
  },
};

export default nextConfig;
