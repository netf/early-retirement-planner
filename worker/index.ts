/** Cloudflare Worker entry: serves the vinext app. No database, no external services — every figure stays in the visitor's browser. */
import handler from "vinext/server/app-router-entry";

interface Env {
  ASSETS: { fetch: typeof fetch };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

/** One year, subdomains included: fire.netf.io has none, so this only pins the host itself. */
const HSTS = "max-age=31536000; includeSubDomains";

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);
    // Always HTTPS: a plan link pasted without the scheme must never load over plain HTTP.
    if (url.protocol === "http:" && url.hostname !== "localhost") {
      url.protocol = "https:";
      return Response.redirect(url.toString(), 301);
    }
    const upstream = await handler.fetch(request, env, ctx);
    const response = new Response(upstream.body, upstream);
    response.headers.set("Strict-Transport-Security", HSTS);
    response.headers.set("X-Content-Type-Options", "nosniff");
    response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
    return response;
  },
};

export default worker;
