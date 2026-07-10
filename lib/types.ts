// Shared types for the COE KFA dashboard.

// Short month keys, in display order. Add "aug", "sep"... here as the year
// progresses and the sync + UI will pick them up automatically.
export const MONTH_DEFS = [
  { key: "mar", short: "Mar", full: "March" },
  { key: "apr", short: "Apr", full: "April" },
  { key: "may", short: "May", full: "May" },
  { key: "jun", short: "Jun", full: "June" },
  { key: "jul", short: "Jul", full: "July" },
] as const;

export type MonthKey = (typeof MONTH_DEFS)[number]["key"];

export interface MonthEntry {
  pct: number | null;
  update: string | null;
}

// One row in the Supabase `programs` table.
export interface ProgramRecord {
  id: number;
  program_name: string | null;
  group_name: string | null;
  priority_alignment: string | null;
  program_manager: string | null;
  program_director: string | null;
  smart_kfa: string | null;
  start_date: string | null;
  target_completion_date: string | null;
  true_north: string | null;
  kfa_coe10: string | null;
  focus: string | null;
  status: string | null;
  latest_comment: string | null;
  working: string | null;
  risk: string | null;
  monthly: Record<string, MonthEntry>;
  modified_by: string | null;
  synced_at?: string | null;
}

// ---- Transformed payload consumed by the UI (mirrors the sample HTML) ----

export type Health = "GREEN" | "YELLOW" | "RED";

export interface PriorityProgram {
  name: string;
  working: string;
  risk: string;
}

export interface Priority {
  code: string;
  title: string;
  owner: string;
  tagline: string;
  health: Health;
  issue: string;
  needs: string;
  programs: PriorityProgram[];
}

export interface ProgramDetail {
  group: string;
  pm: string;
  director: string;
  status: string;
  true_north: string;
  kfa_coe10: string;
  focus: string;
  smart_kfa: string;
  monthly: Record<string, MonthEntry>;
}

export interface Payload {
  programs: Record<string, ProgramDetail>;
  priorities: Priority[];
  total_programs: number;
  on_track: number;
  off_track: number;
  isolated: number;
  cls_lite: number;
  synced_at: string | null;
}
