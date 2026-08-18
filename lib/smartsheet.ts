import { type ProgramRecord, type MonthEntry } from "./types";

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

// Canonical month names, index 0 = January. The three-letter lowercase
// abbreviation is the key used in the `monthly` jsonb column.
const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

const MONTH_KEYS = MONTH_NAMES.map((m) => m.slice(0, 3).toLowerCase());

// Build a lookup of month name -> key, e.g. "august" -> "aug".
const NAME_TO_KEY = new Map<string, string>(
  MONTH_NAMES.map((name, i) => [name.toLowerCase(), MONTH_KEYS[i]])
);

// "August Update" -> aug   |   "Aug Update" -> aug
const UPDATE_TITLE = /^([a-z]+)\s+update$/i;
// "% Complete (August)" -> aug   |   "% Complete(August)" -> aug
const PCT_TITLE = /^%\s*complete\s*\(\s*([a-z]+)\s*\)$/i;

// Resolve a captured word ("August", "Aug") to a month key, or null if it
// isn't a month at all.
function monthKeyFromWord(word: string): string | null {
  const w = word.trim().toLowerCase();
  if (NAME_TO_KEY.has(w)) return NAME_TO_KEY.get(w)!;
  // Tolerate three-letter abbreviations in the column title.
  const abbrev = w.slice(0, 3);
  return MONTH_KEYS.includes(abbrev) && w.length <= 4 ? abbrev : null;
}

/**
 * Scan the sheet header for month columns instead of relying on a hardcoded
 * list. Any column titled "<Month> Update" or "% Complete (<Month>)" is picked
 * up automatically, so adding a new month in Smartsheet requires no code
 * change here.
 */
function detectMonthColumns(
  sheet: SmartsheetSheet
): Array<{ key: string; update: string | null; pct: string | null }> {
  const found = new Map<string, { update: string | null; pct: string | null }>();

  const ensure = (key: string) => {
    if (!found.has(key)) found.set(key, { update: null, pct: null });
    return found.get(key)!;
  };

  for (const col of sheet.columns) {
    const title = col.title.trim();

    const um = title.match(UPDATE_TITLE);
    if (um) {
      const key = monthKeyFromWord(um[1]);
      if (key) {
        ensure(key).update = title;
        continue;
      }
    }

    const pm = title.match(PCT_TITLE);
    if (pm) {
      const key = monthKeyFromWord(pm[1]);
      if (key) ensure(key).pct = title;
    }
  }

  // Return in calendar order so the jsonb keys land predictably.
  return MONTH_KEYS.filter((k) => found.has(k)).map((key) => ({
    key,
    ...found.get(key)!,
  }));
}

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
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  // Tolerate "40%", "40.00%", " 40 " from text-typed percent columns.
  const cleaned = String(v).replace(/[%\s,]/g, "");
  const n = parseFloat(cleaned);
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

  // Detected once per sync, not once per row.
  const monthCols = detectMonthColumns(sheet);

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
    for (const { key, update: updateCol, pct: pctCol } of monthCols) {
      const update = updateCol ? asText(get(updateCol)) : null;
      const pct = pctCol ? asNumber(get(pctCol)) : null;
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
