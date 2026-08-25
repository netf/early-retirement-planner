import { looksLikePlan, normalisePlan, type PlanInputs } from "./plan.ts";

/**
 * A plan as a URL fragment: `#plan=z.<base64url deflate-raw JSON>` (or `j.` uncompressed where
 * CompressionStream is unavailable). Fragments never reach the server, so sharing a link shares
 * the plan with whoever holds the link and nobody else.
 */
export const LINK_PREFIX = "plan=";

const toBase64Url = (bytes: Uint8Array) => btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join("")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const fromBase64Url = (text: string) => Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - text.length % 4) % 4)), (char) => char.charCodeAt(0));

async function deflate(bytes: Uint8Array): Promise<Uint8Array | null> {
  if (typeof CompressionStream === "undefined") return null;
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

async function inflate(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** The fragment (without the leading #) that encodes this plan. */
export async function encodePlanLink(plan: PlanInputs): Promise<string> {
  const json = new TextEncoder().encode(JSON.stringify(plan));
  const packed = await deflate(json);
  return packed ? `${LINK_PREFIX}z.${toBase64Url(packed)}` : `${LINK_PREFIX}j.${toBase64Url(json)}`;
}

/** The plan a fragment encodes, or null if it is not one of ours or has been damaged. */
export async function decodePlanLink(fragment: string): Promise<PlanInputs | null> {
  const body = fragment.startsWith("#") ? fragment.slice(1) : fragment;
  if (!body.startsWith(LINK_PREFIX)) return null;
  const payload = body.slice(LINK_PREFIX.length);
  const kind = payload.slice(0, 2);
  if (kind !== "z." && kind !== "j.") return null;
  try {
    const bytes = fromBase64Url(payload.slice(2));
    const json = new TextDecoder().decode(kind === "z." ? await inflate(bytes) : bytes);
    const parsed: unknown = JSON.parse(json);
    return looksLikePlan(parsed) ? normalisePlan(parsed) : null;
  } catch {
    return null;
  }
}
