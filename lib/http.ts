import { NextResponse } from "next/server";
export class HttpError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
// A bounded process-wide budget protects a local demo server. Hosted deployments
// must also enforce a shared edge quota; see docs/DEPLOYMENT.md.
let windowStart = 0;
let requests = 0;
export function guard(request: Request) {
  if (Date.now() - windowStart > 60_000) {
    windowStart = Date.now();
    requests = 0;
  }
  if (++requests > 600)
    throw new HttpError("Request limit reached. Retry in one minute.", 429);
  const origin = request.headers.get("origin");
  if (
    (origin && origin !== new URL(request.url).origin) ||
    request.headers.get("sec-fetch-site") === "cross-site"
  )
    throw new HttpError("Cross-site request denied", 403);
}
export async function limitedText(
  message: Request | Response,
  max = 100_000,
): Promise<string> {
  const reader = message.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.length;
      if (size > max) {
        await reader.cancel();
        throw new HttpError("Payload too large", 413);
      }
      chunks.push(part.value);
    }
  } finally {
    reader.releaseLock();
  }
  const joined = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    joined.set(chunk, offset);
    offset += chunk.length;
  }
  return new TextDecoder().decode(joined);
}
export async function jsonBody(request: Request): Promise<unknown> {
  try {
    return JSON.parse(await limitedText(request));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("Invalid JSON");
  }
}
export async function upstream(
  url: string,
  init: RequestInit = {},
): Promise<Response> {
  try {
    const response = await fetch(url, {
      ...init,
      cache: "no-store",
      signal: AbortSignal.timeout(15_000),
    });
    if (!response.ok)
      throw new HttpError(
        response.status === 429
          ? "Provider rate limit reached. Try again shortly."
          : "Test-network provider unavailable",
        response.status === 429 ? 429 : 502,
      );
    return response;
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("Test-network request timed out or failed", 502);
  }
}
export async function upstreamJson(
  url: string,
  init?: RequestInit,
): Promise<any> {
  try {
    return JSON.parse(await limitedText(await upstream(url, init), 2_000_000));
  } catch (e) {
    if (e instanceof HttpError) throw e;
    throw new HttpError("Invalid provider response", 502);
  }
}
export function failure(error: unknown) {
  return NextResponse.json(
    { error: error instanceof HttpError ? error.message : "Request failed" },
    {
      status: error instanceof HttpError ? error.status : 500,
      headers: { "Cache-Control": "no-store" },
    },
  );
}
