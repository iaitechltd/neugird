import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Emit a self-contained server (`.next/standalone`) for a small Docker image
  // on Cloud Run. NOTE: `pg` is loaded via a non-analyzable dynamic import (see
  // store-postgres.ts), so the file tracer omits it — the Dockerfile installs it
  // into the standalone bundle explicitly.
  output: "standalone",
};

export default nextConfig;
