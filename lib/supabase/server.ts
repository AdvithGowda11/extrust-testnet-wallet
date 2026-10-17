import "server-only";
import { createClient } from "@supabase/supabase-js";
import { HttpError } from "@/lib/http";
export async function authenticatedClient(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL,
    key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) throw new HttpError("Cloud backup is not configured", 503);
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ") || header.length > 8192)
    throw new HttpError("Sign in to use cloud backup", 401);
  // User-scoped client: RLS applies. No service-role access is used by the application.
  const client = createClient(url, key, {
    global: { headers: { Authorization: header } },
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.getUser(header.slice(7));
  if (error || !data.user)
    throw new HttpError("Session expired. Sign in again.", 401);
  return { client, userId: data.user.id };
}
