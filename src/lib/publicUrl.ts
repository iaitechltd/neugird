/**
 * Public-facing request URL. Behind a proxy (Cloud Run), `request.url` carries
 * the internal host (0.0.0.0:8080) — x402 402 challenges must advertise the
 * public `resource` URL the payer actually called. Order: NEUGRID_PUBLIC_URL
 * env override → x-forwarded-host/proto headers → the raw request URL.
 */

export function publicRequestUrl(request: Request): string {
  const url = new URL(request.url);
  const base = process.env.NEUGRID_PUBLIC_URL;
  if (base) {
    try {
      const b = new URL(base);
      url.protocol = b.protocol;
      url.host = b.host;
      url.port = b.port; // URL keeps the old port when the new host carries none
      return url.toString();
    } catch {
      /* malformed override — fall through to headers */
    }
  }
  const fHost = request.headers.get("x-forwarded-host")?.split(",")[0]?.trim();
  if (fHost) {
    const fProto = request.headers.get("x-forwarded-proto")?.split(",")[0]?.trim();
    url.host = fHost;
    if (!fHost.includes(":")) url.port = "";
    url.protocol = `${fProto || "https"}:`;
  }
  return url.toString();
}
