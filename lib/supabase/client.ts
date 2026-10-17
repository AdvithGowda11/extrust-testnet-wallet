"use client";

import { createClient, SupabaseClient } from "@supabase/supabase-js";

let cached: SupabaseClient | null = null;

/**
 * Browser Supabase client, using the publishable (anon) key.
 *
 * The anon key is meant to be public. Everything it can reach is constrained by
 * the Row Level Security policies defined in the migrations, which restrict
 * every table to the rows owned by the signed-in user.
 *
 * Returns null when Supabase is not configured, so the wallet keeps working as
 * a purely local, no-account application.
 */
export function getSupabase(): SupabaseClient | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!url || !anonKey) return null;
  if (cached) return cached;

  cached = createClient(url, anonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      storageKey: "trust_wallet_auth",
    },
  });

  return cached;
}

/** True when cloud features (accounts, backup) are available. */
export function isCloudEnabled(): boolean {
  return getSupabase() !== null;
}
