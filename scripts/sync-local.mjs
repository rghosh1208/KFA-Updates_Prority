// Manual one-off sync you can run from your laptop:
//   1) fill in .env.local
//   2) npm run sync:local
// Useful for the very first load, or to test credentials before deploying.

import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

// Minimal .env.local loader (no extra dependency).
try {
  const env = readFileSync(new URL("../.env.local", import.meta.url), "utf8");
  for (const line of env.split("\n")) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m && !process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
} catch {
  console.warn("No .env.local found — relying on shell environment variables.");
}

const MONTHS = {
  mar: { update: "March Update", pct: "% Complete (March)" },
  apr: { update: "April Update", pct: "% Complete (April)" },
  may: { update: "May Update", pct: "% Complete (May)" },
  jun: { update: "June Update", pct: "% Complete (June)" },
  jul: { update: "July Update", pct: "% Complete (July)" },
};

const TITLES = {
  group: "Group", priority: "Priority Alignment", name: "Program Name",
  pm: "Program Manager", director: "Program Director", smartKfa: "Smart KFA",
  start: "Start date", target: "Target Completion Date", trueNorth: "True North Focus",
  latestComment: "Latest Comment", modifiedBy: "Modified By",
  kfaCoe10: "KFA (COE 10.0)", focus: "Focus", status: "Status",
  working: "What's Working", risk: "What's At Risk",
};

const text = (v) => (v == null || v === "" ? null : String(v).trim());
const number = (v) => {
  if (v == null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};
const date = (v) => {
  const t = text(v);
  const m = t && t.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};

async function main() {
  const token = process.env.SMARTSHEET_API_TOKEN;
  const sheetId = process.env.SMARTSHEET_SHEET_ID;
  if (!token || !sheetId) throw new Error("Missing SMARTSHEET_API_TOKEN or SMARTSHEET_SHEET_ID");

  const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Smartsheet API ${res.status}: ${await res.text()}`);
  const sheet = await res.json();

  const titleToId = new Map(sheet.columns.map((c) => [c.title.trim(), c.id]));
  const records = [];
  for (const row of sheet.rows) {
    const byId = new Map(row.cells.map((c) => [c.columnId, c]));
    const get = (title) => {
      const id = titleToId.get(title);
      const cell = id != null ? byId.get(id) : null;
      return cell ? (cell.value ?? cell.displayValue ?? null) : null;
    };
    const name = text(get(TITLES.name));
    if (!name) continue;
    const monthly = {};
    for (const [key, cols] of Object.entries(MONTHS)) {
      const u = text(get(cols.update));
      const p = number(get(cols.pct));
      if (u != null || p != null) monthly[key] = { pct: p, update: u };
    }
    records.push({
      id: row.id, program_name: name, group_name: text(get(TITLES.group)),
      priority_alignment: text(get(TITLES.priority)),
      program_manager: text(get(TITLES.pm)), program_director: text(get(TITLES.director)),
      smart_kfa: text(get(TITLES.smartKfa)), start_date: date(get(TITLES.start)),
      target_completion_date: date(get(TITLES.target)), true_north: text(get(TITLES.trueNorth)),
      kfa_coe10: text(get(TITLES.kfaCoe10)), focus: text(get(TITLES.focus)),
      status: text(get(TITLES.status)), latest_comment: text(get(TITLES.latestComment)),
      working: text(get(TITLES.working)), risk: text(get(TITLES.risk)),
      monthly, modified_by: text(get(TITLES.modifiedBy)), synced_at: new Date().toISOString(),
    });
  }

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { persistSession: false } }
  );
  const { error } = await supabase.from("programs").upsert(records, { onConflict: "id" });
  if (error) throw error;
  console.log(`Synced ${records.length} programs to Supabase.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
