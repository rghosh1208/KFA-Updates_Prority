"use client";

import { useMemo, useRef, useState } from "react";
import { MONTH_DEFS, type Payload } from "@/lib/types";

const fmtPct = (v: number | null | undefined) =>
  v == null ? "—" : Math.round(v * 100) + "%";

export default function Dashboard({ payload }: { payload: Payload }) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);

  const priorities = payload.priorities;

  // Only render month columns that at least one program reports, so the
  // cards don't show a wall of empty months early in the year.
  const activeMonths = useMemo(() => {
    return MONTH_DEFS.filter(({ key }) =>
      Object.values(payload.programs).some((p) => p.monthly && p.monthly[key])
    );
  }, [payload.programs]);

  // program name -> list of {priorityIdx, programIdx} (a program can appear
  // under several priorities).
  const programIndex = useMemo(() => {
    const idx = new Map<string, { priorityIdx: number; programIdx: number }[]>();
    priorities.forEach((p, pi) => {
      p.programs.forEach((pp, ppi) => {
        const list = idx.get(pp.name) || [];
        list.push({ priorityIdx: pi, programIdx: ppi });
        idx.set(pp.name, list);
      });
    });
    return idx;
  }, [priorities]);

  function selectTab(idx: number) {
    setActiveIdx(idx);
  }

  function onTabKeydown(e: React.KeyboardEvent, cur: number) {
    let next = cur;
    if (e.key === "ArrowRight" || e.key === "ArrowDown")
      next = (cur + 1) % priorities.length;
    else if (e.key === "ArrowLeft" || e.key === "ArrowUp")
      next = (cur - 1 + priorities.length) % priorities.length;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = priorities.length - 1;
    else return;
    e.preventDefault();
    selectTab(next);
    tabRefs.current[next]?.focus();
  }

  function jumpToProgram(name: string) {
    const hits = programIndex.get(name);
    if (!hits || hits.length === 0) return;
    const { priorityIdx, programIdx } = hits[0];
    setActiveIdx(priorityIdx);
    const key = `${priorityIdx}-${programIdx}`;
    setExpanded((prev) => ({ ...prev, [key]: true }));
  }

  const stats = [
    { num: payload.total_programs, lbl: "Total Programs", cls: "" },
    { num: payload.on_track, lbl: "On Track", cls: "green" },
    { num: payload.off_track, lbl: "Off Track", cls: "red" },
    { num: priorities.filter((p) => /^P\d/.test(p.code)).length, lbl: "Priorities", cls: "" },
    { num: payload.isolated, lbl: "Isolated", cls: "" },
    { num: payload.cls_lite, lbl: "CLS Lite", cls: "" },
  ];

  const p = priorities[activeIdx];

  return (
    <div className="shell">
      <a className="skip-link" href="#main">
        Skip to main content
      </a>

      <header role="banner">
        <p className="eyebrow">
          COE 10.0 · Program Synergy &amp; Strategic Alignment · Live View
        </p>
        <h1 className="h-title" id="page-title">
          2026 Programs by Priority
        </h1>
        <p className="h-sub">
          UCSF Campus Life Services · Facilities Services · Center of Excellence
          {payload.synced_at
            ? ` · Synced ${new Date(payload.synced_at).toLocaleString()}`
            : ""}
        </p>
      </header>

      <section aria-labelledby="stats-heading">
        <h2 id="stats-heading" className="sr-only">
          Portfolio statistics
        </h2>
        <ul className="stats" aria-label="Portfolio statistics">
          {stats.map((s, i) => (
            <li key={i}>
              <span className={`num ${s.cls}`} aria-hidden="true">
                {s.num}
              </span>
              <span className="sr-only">{s.num} </span>
              <span className="lbl">{s.lbl}</span>
            </li>
          ))}
        </ul>
      </section>

      <main id="main" tabIndex={-1}>
        <nav aria-label="Priority sections">
          <h2 className="sr-only" id="tabs-heading">
            Choose a priority section
          </h2>
          <ul role="tablist" aria-labelledby="tabs-heading">
            {priorities.map((pr, i) => (
              <li role="presentation" key={pr.code}>
                <button
                  ref={(el) => {
                    tabRefs.current[i] = el;
                  }}
                  role="tab"
                  id={`tab-${i}`}
                  aria-controls={`panel-${i}`}
                  aria-selected={i === activeIdx}
                  tabIndex={i === activeIdx ? 0 : -1}
                  onClick={() => selectTab(i)}
                  onKeyDown={(e) => onTabKeydown(e, i)}
                >
                  <span className="tab-code">{pr.code}</span>
                  <span className="tab-title">{pr.title}</span>
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <div className="program-jump" role="search" aria-label="Jump to a specific program">
          <label htmlFor="program-select" className="program-jump-label">
            Jump to program:
          </label>
          <select
            id="program-select"
            defaultValue=""
            onChange={(e) => {
              if (e.target.value) jumpToProgram(e.target.value);
            }}
          >
            <option value="">— Select a program —</option>
            {[...programIndex.keys()].sort().map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        </div>

        <div aria-live="polite" aria-atomic="false">
          {p && (
            <section
              role="tabpanel"
              id={`panel-${activeIdx}`}
              aria-labelledby={`tab-${activeIdx}`}
              tabIndex={0}
            >
              <div className="panel-head">
                <span className="pcode" aria-hidden="true">
                  {p.code}
                </span>
                <div className="pmeta">
                  <h2>{p.title}</h2>
                  <p className="owner">
                    <strong>Owner:</strong> {p.owner}
                  </p>
                  <p className="tagline">{p.tagline}</p>
                </div>
              </div>

              {(p.issue || p.needs) && (
                <div className="callouts">
                  {p.issue && (
                    <section className="callout issue" aria-labelledby={`issue-${activeIdx}`}>
                      <h3 id={`issue-${activeIdx}`}>The Issue</h3>
                      <p>{p.issue}</p>
                    </section>
                  )}
                  {p.needs && (
                    <section className="callout needs" aria-labelledby={`needs-${activeIdx}`}>
                      <h3 id={`needs-${activeIdx}`}>What This Needs</h3>
                      <p>{p.needs}</p>
                    </section>
                  )}
                </div>
              )}

              <div className="programs-head">
                <h3 id={`progs-${activeIdx}`}>
                  Programs Contributing to {p.title}
                </h3>
                <span className="count">
                  {p.programs.length}{" "}
                  {p.programs.length === 1 ? "program" : "programs"} · Use Tab or
                  Enter to expand each
                </span>
              </div>

              <ul className="program-list" aria-labelledby={`progs-${activeIdx}`}>
                {p.programs.map((pp, pi) => {
                  const data = payload.programs[pp.name] || ({} as any);
                  const key = `${activeIdx}-${pi}`;
                  const isOpen = !!expanded[key];
                  const statusCls = data.status === "Off Track" ? "off" : "on";
                  const progId = `prog-${activeIdx}-${pi}`;

                  const months = activeMonths.map((m) => {
                    const e = (data.monthly || {})[m.key];
                    return {
                      short: m.short,
                      full: m.full,
                      val: e && e.pct != null ? e.pct : null,
                      text: e ? e.update : null,
                    };
                  });
                  const maxH = 40;
                  const barsAlt = months
                    .map(
                      (m) =>
                        `${m.full} ${
                          m.val != null ? Math.round(m.val * 100) + " percent" : "not reported"
                        }`
                    )
                    .join("; ");

                  return (
                    <li key={key} className="prog" aria-labelledby={`${progId}-name`}>
                      <button
                        className="prog-toggle"
                        aria-expanded={isOpen}
                        aria-controls={`${progId}-body`}
                        id={`${progId}-toggle`}
                        onClick={() =>
                          setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                        }
                      >
                        <span>
                          <span className="nm" id={`${progId}-name`}>
                            {pp.name}
                          </span>
                          <span className="meta">
                            PM: {data.pm || "—"} · Director: {data.director || "—"} ·
                            True North: {data.true_north || "—"}
                          </span>
                        </span>
                        <span className="prog-right">
                          <span className={`status-pill ${statusCls}`}>
                            {data.status || "—"}
                          </span>
                          <span className="bars" role="img" aria-label={`Progress: ${barsAlt}`}>
                            {months.map((m, mi) => {
                              const h =
                                m.val != null ? Math.max(4, Math.round(m.val * maxH)) : 4;
                              const empty = m.val == null;
                              const value = m.val != null ? Math.round(m.val * 100) + "%" : "—";
                              return (
                                <span className="bar" key={mi}>
                                  <span className="bar-v" aria-hidden="true">
                                    {value}
                                  </span>
                                  <span className="bar-track" aria-hidden="true">
                                    <span
                                      className={`bar-fill${empty ? " empty" : ""}`}
                                      style={{ height: `${h}px` }}
                                    />
                                  </span>
                                  <span className="bar-lbl" aria-hidden="true">
                                    {m.short}
                                  </span>
                                </span>
                              );
                            })}
                          </span>
                          <span className="chev" aria-hidden="true">
                            ▾
                          </span>
                        </span>
                      </button>

                      {isOpen && (
                        <div className="prog-body" id={`${progId}-body`}>
                          {(data.kfa_coe10 || data.focus) && (
                            <div className="kfa">
                              {data.kfa_coe10 && (
                                <div>
                                  <span className="kfa-lbl">Key Focus Area:</span>{" "}
                                  {data.kfa_coe10}
                                </div>
                              )}
                              {data.focus && <div className="kfa-focus">{data.focus}</div>}
                            </div>
                          )}

                          <section className="month-section" aria-labelledby={`${progId}-monthly`}>
                            <h4 id={`${progId}-monthly`}>Monthly Updates</h4>
                            <div className="months">
                              {months.map((m, mi) => (
                                <article
                                  className="month"
                                  key={mi}
                                  aria-labelledby={`${progId}-m-${m.short}-name`}
                                >
                                  <header className="month-head">
                                    <span
                                      className="month-name"
                                      id={`${progId}-m-${m.short}-name`}
                                    >
                                      {m.full}
                                    </span>
                                    <span
                                      className="month-pct"
                                      aria-label={`completion ${fmtPct(m.val)}`}
                                    >
                                      {fmtPct(m.val)}
                                    </span>
                                  </header>
                                  <div className={`month-body ${m.text ? "" : "empty"}`}>
                                    {m.text || "No update logged for this month."}
                                  </div>
                                </article>
                              ))}
                            </div>
                          </section>
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </section>
          )}
        </div>
      </main>

      <footer role="contentinfo">
        <p>
          Source: 2026 Initiatives (KFAs) Smartsheet · Live sync via Supabase.
          {payload.synced_at
            ? ` Last synced ${new Date(payload.synced_at).toLocaleString()}.`
            : ""}
        </p>
        <p>
          High-contrast variant: black background with white text (21:1 contrast
          — WCAG AAA). Color-coded indicators paired with text labels. Keyboard-first
          navigation via ARIA tab pattern.
        </p>
      </footer>
    </div>
  );
}
