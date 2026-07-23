import { useQuery } from "@tanstack/react-query";
import { Menu, Search } from "lucide-react";
import { KeyboardEvent, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { apiFetch } from "../../lib/api";
import { Case, DocumentWithCase } from "../../types";
import Input from "../ui/Input";
import NotificationBell from "./NotificationBell";
import RunIndicator from "./RunIndicator";
import UserMenu from "./UserMenu";

const SECTION_LABELS: Record<string, string> = {
  "/cases": "Cases",
  "/clients": "Clients",
  "/documents": "Documents",
  "/calendar": "Calendar",
  "/settings": "Settings",
};

function Breadcrumb() {
  const { caseId } = useParams<{ caseId: string }>();
  const location = useLocation();
  const { data: caseData } = useQuery({
    queryKey: ["case", caseId],
    queryFn: () => apiFetch<Case>(`/cases/${caseId}`),
    enabled: !!caseId,
  });

  if (caseId) {
    return (
      <div className="flex min-w-0 items-center gap-1.5 text-sm">
        <Link to="/cases" className="shrink-0 text-text-dim hover:text-text">
          Cases
        </Link>
        <span className="shrink-0 text-text-faint">/</span>
        <span className="truncate text-text">{caseData?.beneficiary_name ?? "…"}</span>
      </div>
    );
  }

  if (location.pathname === "/") {
    return <span className="truncate text-sm text-text">Overview</span>;
  }

  const label = SECTION_LABELS[location.pathname];
  return <span className="truncate text-sm text-text">{label ?? "Casewright"}</span>;
}

/** Expanding topbar search (Phase 8, T8.5) — on focus opens a dropdown under the input showing
 * live-filtered Cases and Documents groups. Cases reuse the shared `["cases"]` cache (same
 * `beneficiary_name` substring filter as `CasesList`'s search). Documents use a firm-wide fetch
 * with its own query key, only fetched when the dropdown is open and the query is non-empty (so
 * we don't eagerly load every firm document on every page just for the topbar). Not bound to ⌘K,
 * which is reserved for CommandPalette (docs/internal/PLAN.md Phase 8 header, deviation #2) — focusing the
 * input is the only way to open this. */
function TopbarSearch() {
  const navigate = useNavigate();
  const containerRef = useRef<HTMLDivElement>(null);
  const [value, setValue] = useState("");
  const [open, setOpen] = useState(false);

  const query = value.trim().toLowerCase();

  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });
  // Only fetch all firm documents when the dropdown is actually open and there's a query —
  // avoids loading the whole document library on every page just to power a topbar dropdown.
  const { data: documents } = useQuery({
    queryKey: ["documents", "topbar-search"],
    queryFn: () => apiFetch<DocumentWithCase[]>("/documents"),
    enabled: open && query.length > 0,
  });

  const caseResults = useMemo(() => {
    if (!query) return [];
    return (cases ?? []).filter((c) => c.beneficiary_name.toLowerCase().includes(query)).slice(0, 6);
  }, [cases, query]);

  const documentResults = useMemo(() => {
    if (!query) return [];
    return (documents ?? [])
      .filter(
        (d) =>
          (d.exhibit_label ?? "").toLowerCase().includes(query) ||
          d.beneficiary_name.toLowerCase().includes(query),
      )
      .slice(0, 6);
  }, [documents, query]);

  const hasResults = caseResults.length > 0 || documentResults.length > 0;

  // Close on outside click.
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  function close() {
    setOpen(false);
  }

  function handleKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      close();
      (e.target as HTMLInputElement).blur();
    }
    if (e.key === "Enter") {
      // Enter on the first hit navigates; mirrors the old behavior of dropping into Cases.
      if (caseResults[0]) {
        navigate(`/cases/${caseResults[0].id}`);
        close();
      } else if (documentResults[0]) {
        navigate(`/cases/${documentResults[0].case_id}`);
        close();
      } else {
        navigate("/cases");
        close();
      }
    }
  }

  const showDropdown = open && query.length > 0;

  return (
    // Hidden below `sm` (no room for it alongside the hamburger + breadcrumb + right icon
    // cluster on a phone-width viewport — ⌘K/CommandPalette covers the same lookup there),
    // then grows progressively wider as there's more room. `min-w-0` lets this shrink inside
    // the header's flex row instead of forcing page-level horizontal overflow.
    <div ref={containerRef} className="relative hidden min-w-0 sm:block sm:w-48 md:w-64 lg:w-80">
      <Search size={14} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-text-faint" />
      <Input
        value={value}
        onChange={(e) => {
          setValue(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={handleKeyDown}
        placeholder="Search cases & documents…"
        className="pl-8"
      />
      {showDropdown && (
        <div className="absolute z-50 mt-1 w-full rounded-card border border-border bg-surface shadow-elevated">
          {!hasResults ? (
            <p className="p-3 text-sm text-text-dim">No matches.</p>
          ) : (
            <>
              {caseResults.length > 0 && (
                <div>
                  <p className="border-b border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-text-dim">
                    Cases
                  </p>
                  <ul>
                    {caseResults.map((c) => (
                      <li key={c.id}>
                        <button
                          type="button"
                          onClick={() => {
                            navigate(`/cases/${c.id}`);
                            close();
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text hover:bg-surface-2"
                        >
                          <span>{c.beneficiary_name}</span>
                          <span className="font-mono text-xs text-text-faint">{c.visa_category}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {documentResults.length > 0 && (
                <div>
                  <p className="border-b border-border px-3 py-1.5 font-mono text-[11px] uppercase tracking-wide text-text-dim">
                    Documents
                  </p>
                  <ul>
                    {documentResults.map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => {
                            navigate(`/cases/${d.case_id}`);
                            close();
                          }}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm text-text hover:bg-surface-2"
                        >
                          <span className="truncate">
                            {d.exhibit_label ? `${d.exhibit_label} · ` : ""}
                            {d.beneficiary_name}
                          </span>
                          <span className="ml-2 shrink-0 font-mono text-xs capitalize text-text-faint">
                            {d.kind.replace(/_/g, " ")}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default function Topbar({ onMenuClick }: { onMenuClick: () => void }) {
  return (
    <header className="flex h-14 items-center justify-between gap-3 border-b border-border bg-surface px-3 sm:px-6">
      <div className="flex min-w-0 items-center gap-2">
        <button
          onClick={onMenuClick}
          aria-label="Open menu"
          className="shrink-0 rounded-control p-1.5 text-text-dim hover:bg-surface-2 hover:text-text lg:hidden"
        >
          <Menu size={18} />
        </button>
        <Breadcrumb />
      </div>
      <TopbarSearch />
      <div className="flex shrink-0 items-center gap-2 sm:gap-3">
        <RunIndicator />
        <NotificationBell />
        <UserMenu />
      </div>
    </header>
  );
}