import { NextRequest, NextResponse } from "next/server";
import { authenticatedClient } from "@/lib/supabase/server";
import { validateBackup } from "@/lib/backupFormat";
import { guard, jsonBody, failure, HttpError } from "@/lib/http";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: NextRequest) {
  try {
    guard(request);
    const { client, userId } = await authenticatedClient(request);
    const { data, error } = await client
      .from("wallet_backups")
      .select("ciphertext,salt,iv,kdf_iterations,format_version")
      .eq("user_id", userId)
      .maybeSingle();
    if (error)
      throw new HttpError(
        "Backup database unavailable. Check its migration and policies.",
        503,
      );
    if (data && data.format_version !== 2)
      throw new HttpError(
        "This is an older mnemonic-only backup. Preserve it and use the legacy recovery procedure; it must not be re-derived silently.",
        409,
      );
    return NextResponse.json(
      {
        backup: data
          ? {
              version: 2,
              ciphertext: data.ciphertext,
              salt: data.salt,
              iv: data.iv,
              kdfIterations: data.kdf_iterations,
            }
          : null,
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return failure(e);
  }
}
export async function POST(request: NextRequest) {
  try {
    guard(request);
    const { client, userId } = await authenticatedClient(request);
    const body = await jsonBody(request);
    try {
      validateBackup(body);
    } catch {
      throw new HttpError("Invalid encrypted wallet backup");
    }
    const { error } = await client
      .from("wallet_backups")
      .upsert(
        {
          user_id: userId,
          ciphertext: body.ciphertext,
          salt: body.salt,
          iv: body.iv,
          kdf_iterations: body.kdfIterations,
          format_version: 2,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "user_id" },
      );
    if (error)
      throw new HttpError(
        "Backup could not be saved. Check database setup.",
        503,
      );
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
export async function DELETE(request: NextRequest) {
  try {
    guard(request);
    const { client, userId } = await authenticatedClient(request);
    const { error } = await client
      .from("wallet_backups")
      .delete()
      .eq("user_id", userId);
    if (error) throw new HttpError("Backup could not be deleted", 503);
    return NextResponse.json({ ok: true });
  } catch (e) {
    return failure(e);
  }
}
