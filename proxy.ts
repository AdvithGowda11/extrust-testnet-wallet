import { NextRequest, NextResponse } from "next/server";
export function proxy(request: NextRequest) {
  const nonce = btoa(crypto.randomUUID());
  let cloud = "";
  try {
    if (process.env.NEXT_PUBLIC_SUPABASE_URL)
      cloud = new URL(process.env.NEXT_PUBLIC_SUPABASE_URL).origin;
  } catch {}
  const dev = process.env.NODE_ENV !== "production";
  const policy = `default-src 'self'; script-src 'self' 'nonce-${nonce}' 'strict-dynamic' 'wasm-unsafe-eval'${dev ? " 'unsafe-eval'" : ""}; style-src 'self' 'unsafe-inline'; connect-src 'self' ${cloud}${dev ? " ws://localhost:* ws://127.0.0.1:*" : ""}; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'`;
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", policy);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", policy);
  response.headers.set("Referrer-Policy", "no-referrer");
  response.headers.set("X-Content-Type-Options", "nosniff");
  response.headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=()",
  );
  return response;
}
export const config = {
  matcher: ["/((?!api|_next/static|_next/image|favicon.ico).*)"],
};
