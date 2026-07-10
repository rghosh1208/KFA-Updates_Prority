import { getReadClient } from "@/lib/supabase";
import { buildPayload } from "@/lib/transform";
import type { ProgramRecord } from "@/lib/types";
import Dashboard from "./Dashboard";

// Render on each request (reads live data from Supabase); never prerender at
// build time. The underlying data refreshes on the Smartsheet -> Supabase cron
// cadence set in vercel.json.
export const dynamic = "force-dynamic";

export default async function Page() {
  const supabase = getReadClient();
  const { data, error } = await supabase
    .from("programs")
    .select("*")
    .order("program_name", { ascending: true });

  if (error) {
    return (
      <div className="shell">
        <h1 className="h-title">Dashboard unavailable</h1>
        <p className="h-sub">
          Could not read from Supabase: {error.message}. Check your environment
          variables and that the schema has been created.
        </p>
      </div>
    );
  }

  const records = (data || []) as ProgramRecord[];
  const syncedAt =
    records.reduce<string | null>((latest, r) => {
      if (r.synced_at && (!latest || r.synced_at > latest)) return r.synced_at;
      return latest;
    }, null) ?? null;

  const payload = buildPayload(records, syncedAt);

  if (payload.total_programs === 0) {
    return (
      <div className="shell">
        <h1 className="h-title">No data yet</h1>
        <p className="h-sub">
          The database is empty. Trigger a sync by visiting{" "}
          <code>/api/sync</code> (with your CRON_SECRET) or wait for the
          scheduled cron run.
        </p>
      </div>
    );
  }

  return <Dashboard payload={payload} />;
}
