import { MONTH_DEFS, type ProgramRecord, type MonthEntry } from "./types";

// Smartsheet column titles exactly as they appear in the sheet header row.
const COL = {
  group: "Group",
  priority: "Priority Alignment",
  name: "Program Name",
  pm: "Program Manager",
  director: "Program Director",
  smartKfa: "Smart KFA",
  start: "Start date",
  target: "Target Completion Date",
  trueNorth: "True North Focus",
  latestComment: "Latest Comment",
  supportTeam: "Program Support Team",
  coeTeam: "COE Team",
  modifiedBy: "Modified By",
  kfaCoe10: "KFA (COE 10.0)",
  focus: "Focus",
  status: "Status",
  // Optional editorial columns (add these to the Smartsheet if you want them).
  working: "What's Working",
  risk: "What's At Risk",
} as const;

// Month -> the two Smartsheet column titles for that month.
const MONTH_COLUMNS: Record<string, { update: string; pct: string }> = {
  mar: { update: "March Update", pct: "% Complete (March)" },
  apr: { update: "April Update", pct: "% Complete (April)" },
  may: { update: "May Update", pct: "% Complete (May)" },
  jun: { update: "June Update", pct: "% Complete (June)" },
  jul: { update: "July Update", pct: "% Complete (July)" },
};

interface SmartsheetCell {
  columnId: number;
  value?: unknown;
  displayValue?: string;
}
interface SmartsheetRow {
  id: number;
  cells: SmartsheetCell[];
}
interface SmartsheetColumn {
  id: number;
  title: string;
}
interface SmartsheetSheet {
  columns: SmartsheetColumn[];
  rows: SmartsheetRow[];
}

// Fetch the full sheet from the Smartsheet API.
export async function fetchSheet(): Promise<SmartsheetSheet> {
  const token = process.env.SMARTSHEET_API_TOKEN;
  const sheetId = process.env.SMARTSHEET_SHEET_ID;
  if (!token) throw new Error("Missing SMARTSHEET_API_TOKEN");
  if (!sheetId) throw new Error("Missing SMARTSHEET_SHEET_ID");

  const res = await fetch(`https://api.smartsheet.com/2.0/sheets/${sheetId}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Smartsheet API ${res.status}: ${body.slice(0, 500)}`);
  }
  return (await res.json()) as SmartsheetSheet;
}

const asText = (v: unknown): string | null => {
  if (v === null || v === undefined || v === "") return null;
  return String(v).trim();
};

const asNumber = (v: unknown): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v));
  return Number.isFinite(n) ? n : null;
};

// Smartsheet dates arrive as "YYYY-MM-DD" or ISO; keep the date part only.
const asDate = (v: unknown): string | null => {
  const t = asText(v);
  if (!t) return null;
  const m = t.match(/^\d{4}-\d{2}-\d{2}/);
  return m ? m[0] : null;
};

// Convert a raw Smartsheet sheet into ProgramRecord[] ready for Supabase upsert.
export function mapSheetToRecords(sheet: SmartsheetSheet): ProgramRecord[] {
  const titleToId = new Map<string, number>();
  for (const c of sheet.columns) titleToId.set(c.title.trim(), c.id);

  const records: ProgramRecord[] = [];

  for (const row of sheet.rows) {
    const byId = new Map<number, SmartsheetCell>();
    for (const cell of row.cells) byId.set(cell.columnId, cell);

    const get = (title: string): unknown => {
      const id = titleToId.get(title);
      if (id === undefined) return null;
      const cell = byId.get(id);
      if (!cell) return null;
      // Prefer the typed value; fall back to displayValue for formula/contact cells.
      return cell.value ?? cell.displayValue ?? null;
    };

    const name = asText(get(COL.name));
    // Skip blank rows.
    if (!name) continue;

    const monthly: Record<string, MonthEntry> = {};
    for (const { key } of MONTH_DEFS) {
      const cols = MONTH_COLUMNS[key];
      if (!cols) continue;
      const update = asText(get(cols.update));
      const pct = asNumber(get(cols.pct));
      if (update !== null || pct !== null) {
        monthly[key] = { pct, update };
      }
    }

    records.push({
      id: row.id,
      program_name: name,
      group_name: asText(get(COL.group)),
      priority_alignment: asText(get(COL.priority)),
      program_manager: asText(get(COL.pm)),
      program_director: asText(get(COL.director)),
      smart_kfa: asText(get(COL.smartKfa)),
      start_date: asDate(get(COL.start)),
      target_completion_date: asDate(get(COL.target)),
      true_north: asText(get(COL.trueNorth)),
      kfa_coe10: asText(get(COL.kfaCoe10)),
      focus: asText(get(COL.focus)),
      status: asText(get(COL.status)),
      latest_comment: asText(get(COL.latestComment)),
      working: asText(get(COL.working)),
      risk: asText(get(COL.risk)),
      monthly,
      modified_by: asText(get(COL.modifiedBy)),
    });
  }

  return records;
}
