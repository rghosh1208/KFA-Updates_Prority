import { NextRequest, NextResponse } from "next/server";
import { fetchSheet, mapSheetToRecords } from "@/lib/smartsheet";
import { getWriteClient } from "@/lib/supabase";

// Always run fresh on the server; never statically cache.
export const dynamic = "force-dynamic";
export const runtime = "nodejs";
// Allow up to 60s for the Smartsheet fetch + upsert (Vercel Pro; lower on Hobby).
export const maxDuration = 60;

// GET  /api/sync  — target for Vercel Cron (see vercel.json).
// Also callable manually with the same Bearer token for on-demand refresh.
export async function GET(req: NextRequest) {
  // --- Protect the endpoint ---
  // Vercel Cron automatically sends "Authorization: Bearer <CRON_SECRET>".
  const secret = process.env.CRON_SECRET;
  if (secret) {
    const auth = req.headers.get("authorization");
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  }

  try {
    const sheet = await fetchSheet();
    const records = mapSheetToRecords(sheet);

    if (records.length === 0) {
      return NextResponse.json(
        { ok: false, error: "No rows returned from Smartsheet." },
        { status: 502 }
      );
    }

    const supabase = getWriteClient();
    const now = new Date().toISOString();
    const rows = records.map((r) => ({ ...r, synced_at: now }));

    // Upsert by primary key (Smartsheet row id) so edits update in place.
    const { error } = await supabase
      .from("programs")
      .upsert(rows, { onConflict: "id" });
    if (error) throw error;

    // Remove rows that no longer exist in Smartsheet (deleted programs).
    const ids = records.map((r) => r.id);
    const { error: delErr } = await supabase
      .from("programs")
      .delete()
      .not("id", "in", `(${ids.join(",")})`);
    if (delErr) throw delErr;

    return NextResponse.json({
      ok: true,
      synced: records.length,
      synced_at: now,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("[sync] failed:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
