import {
  MONTH_DEFS,
  type ProgramRecord,
  type Payload,
  type Priority,
  type ProgramDetail,
  type Health,
  type PriorityProgram,
} from "./types";

// Canonical priority codes -> display code + title, in the order shown as tabs.
// "II - Independent Initiatives" is displayed as the "Isolated" group and
// "LITE - Moving to CLS Lite" as the CLS Lite group, matching the sample.
const PRIORITY_META: Record<string, { code: string; title: string }> = {
  P1: { code: "P1", title: "People First" },
  P2: { code: "P2", title: "Asset Management" },
  P3: { code: "P3", title: "Standardize Controls" },
  P4: { code: "P4", title: "Andover (BMS) Retirement" },
  P5: { code: "P5", title: "PM Job Plan Updates" },
  P6: { code: "P6", title: "Technology Roadmap" },
  P7: { code: "P7", title: "Service Line Growth" },
  II: { code: "ISO", title: "Isolated Projects" },
  LITE: { code: "LITE", title: "Moving to CLS Lite" },
};

const PRIORITY_ORDER = ["P1", "P2", "P3", "P4", "P5", "P6", "P7", "II", "LITE"];

// Parse the raw "Priority Alignment" cell into canonical keys.
// Handles multi-line values like "P2 - Asset Management\nP4 - Andover (BMS)...".
function parsePriorityKeys(raw: string | null): string[] {
  if (!raw) return [];
  const keys = new Set<string>();
  for (const line of raw.split(/[\n,;]+/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^(P[1-7]|II|LITE)\b/i);
    if (m) keys.add(m[1].toUpperCase());
  }
  return [...keys];
}

// Most recent month that has a percentage, as a 0..1 fraction.
function latestPct(rec: ProgramRecord): number | null {
  for (let i = MONTH_DEFS.length - 1; i >= 0; i--) {
    const e = rec.monthly[MONTH_DEFS[i].key];
    if (e && e.pct != null) return e.pct;
  }
  return null;
}

// Most recent monthly narrative, used as a fallback for "What's Working".
function latestUpdate(rec: ProgramRecord): string | null {
  for (let i = MONTH_DEFS.length - 1; i >= 0; i--) {
    const e = rec.monthly[MONTH_DEFS[i].key];
    if (e && e.update) return e.update;
  }
  return null;
}

// Derive a health rating for a priority from its contributing programs:
//   RED    -> any program Off Track
//   GREEN  -> average latest completion >= 50%
//   YELLOW -> otherwise (in progress, nothing off track)
function deriveHealth(recs: ProgramRecord[]): Health {
  if (recs.some((r) => (r.status || "").toLowerCase().includes("off"))) {
    return "RED";
  }
  const pcts = recs.map(latestPct).filter((p): p is number => p != null);
  if (pcts.length === 0) return "YELLOW";
  const avg = pcts.reduce((a, b) => a + b, 0) / pcts.length;
  return avg >= 0.5 ? "GREEN" : "YELLOW";
}

const uniq = (xs: (string | null)[]): string[] => {
  const seen = new Set<string>();
  for (const x of xs) {
    if (!x) continue;
    for (const part of x.split(",")) {
      const t = part.trim();
      if (t) seen.add(t);
    }
  }
  return [...seen];
};

export function buildPayload(
  records: ProgramRecord[],
  syncedAt: string | null
): Payload {
  // Program detail map, keyed by program name (mirrors HTML DATA.programs).
  const programs: Record<string, ProgramDetail> = {};
  for (const r of records) {
    if (!r.program_name) continue;
    programs[r.program_name] = {
      group: r.group_name || "",
      pm: r.program_manager || "",
      director: r.program_director || "",
      status: r.status || "",
      true_north: r.true_north || "",
      kfa_coe10: r.kfa_coe10 || "",
      focus: r.focus || "",
      smart_kfa: r.smart_kfa || "",
      monthly: r.monthly || {},
    };
  }

  // Bucket programs under each priority they align to.
  const buckets = new Map<string, ProgramRecord[]>();
  for (const r of records) {
    for (const key of parsePriorityKeys(r.priority_alignment)) {
      const list = buckets.get(key) || [];
      list.push(r);
      buckets.set(key, list);
    }
  }

  const priorities: Priority[] = [];
  for (const key of PRIORITY_ORDER) {
    const recs = buckets.get(key);
    if (!recs || recs.length === 0) continue;
    const meta = PRIORITY_META[key] || { code: key, title: key };

    const priorityPrograms: PriorityProgram[] = recs.map((r) => ({
      name: r.program_name || "",
      // Editorial fields, if present in Smartsheet; else graceful fallbacks.
      working:
        r.working ||
        latestUpdate(r) ||
        "No monthly narrative logged yet for this program.",
      risk:
        r.risk ||
        r.latest_comment ||
        "No risks or blockers recorded for this program.",
    }));

    priorities.push({
      code: meta.code,
      title: meta.title,
      owner: uniq(recs.map((r) => r.program_director)).join(", ") || "—",
      tagline: `${recs.length} program${recs.length === 1 ? "" : "s"} aligned to ${meta.title}.`,
      health: deriveHealth(recs),
      // "The Issue" / "What This Needs" are editorial; left blank for the live
      // feed. The UI hides these callouts when empty.
      issue: "",
      needs: "",
      programs: priorityPrograms,
    });
  }

  const total = records.filter((r) => r.program_name).length;
  const onTrack = records.filter((r) =>
    (r.status || "").toLowerCase().includes("on")
  ).length;
  const offTrack = records.filter((r) =>
    (r.status || "").toLowerCase().includes("off")
  ).length;
  const isolated = (buckets.get("II") || []).length;
  const clsLite = (buckets.get("LITE") || []).length;

  return {
    programs,
    priorities,
    total_programs: total,
    on_track: onTrack,
    off_track: offTrack,
    isolated,
    cls_lite: clsLite,
    synced_at: syncedAt,
  };
}
