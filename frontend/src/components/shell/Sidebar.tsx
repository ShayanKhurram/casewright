import { useQuery } from "@tanstack/react-query";
import {
  CalendarDays,
  FileText,
  Folder,
  LayoutDashboard,
  PanelLeftClose,
  PanelLeftOpen,
  Settings,
  Users,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink } from "react-router-dom";

import { apiFetch } from "../../lib/api";
import { groupOf } from "../../lib/caseGroups";
import { Case, Client, CurrentUser } from "../../types";

const COLLAPSE_KEY = "casewright_sidebar_collapsed";

/** Top-level IA (Phase 8, T8.1) — Dashboard/Cases/Clients/Documents/Calendar, matching
 * `docs/internal/casewright-dashboard-shell-plan.md` §2. */
const NAV_ITEMS = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/cases", label: "Cases", icon: Folder },
  { to: "/clients", label: "Clients", icon: Users },
  { to: "/documents", label: "Documents", icon: FileText },
  { to: "/calendar", label: "Calendar", icon: CalendarDays },
];

/** "urgent" (amber) for the Cases needs-review count; "neutral" for a plain total like
 * Clients' — matches the source doc's "--surface-2 fill or --accent for urgent counts" split. */
function NavBadge({ count, collapsed, tone }: { count: number; collapsed: boolean; tone: "urgent" | "neutral" }) {
  if (collapsed || count === 0) return null;
  return (
    <span
      className={[
        "ml-auto rounded-pill px-1.5 py-0.5 font-mono text-[11px]",
        tone === "urgent" ? "bg-partial/10 text-partial" : "bg-surface-2 text-text-faint",
      ].join(" ")}
    >
      {count}
    </span>
  );
}

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<CurrentUser>("/auth/me"),
  });
  // Shares the ["cases"] cache with CasesList/Overview/CommandPalette — no extra network cost.
  const { data: cases } = useQuery({
    queryKey: ["cases"],
    queryFn: () => apiFetch<Case[]>("/cases"),
  });
  const needsReviewCount = useMemo(
    () => (cases ?? []).filter((c) => groupOf(c.status) === "review").length,
    [cases],
  );
  // Own query — GET /clients is its own roll-up, not derivable from ["cases"] alone without
  // re-deriving the grouping logic client-side too.
  const { data: clients } = useQuery({
    queryKey: ["clients"],
    queryFn: () => apiFetch<Client[]>("/clients"),
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <aside
      className={`flex h-screen flex-col border-r border-border bg-surface transition-all duration-panel ease-casewright ${
        collapsed ? "w-14" : "w-56"
      }`}
    >
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed && <span className="font-display text-lg text-text">Casewright</span>}
        <button
          onClick={() => setCollapsed((c) => !c)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="rounded-control p-1.5 text-text-faint hover:bg-surface-2 hover:text-text"
        >
          {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
        </button>
      </div>

      <nav className="flex-1 px-2 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            className={({ isActive }) =>
              `mb-1 flex items-center gap-3 rounded-control border-l-2 px-2.5 py-2 text-sm transition-colors duration-hover ${
                isActive
                  ? "border-accent bg-surface-2 text-text"
                  : "border-transparent text-text-dim hover:bg-surface-2 hover:text-text"
              }`
            }
          >
            <Icon size={16} className="shrink-0" />
            {!collapsed && <span>{label}</span>}
            {label === "Cases" && <NavBadge count={needsReviewCount} collapsed={collapsed} tone="urgent" />}
            {label === "Clients" && (
              <NavBadge count={clients?.length ?? 0} collapsed={collapsed} tone="neutral" />
            )}
          </NavLink>
        ))}
      </nav>

      <div className="border-t border-border px-2 py-2">
        <NavLink
          to="/settings"
          className={({ isActive }) =>
            `mb-1 flex items-center gap-3 rounded-control border-l-2 px-2.5 py-2 text-sm transition-colors duration-hover ${
              isActive
                ? "border-accent bg-surface-2 text-text"
                : "border-transparent text-text-dim hover:bg-surface-2 hover:text-text"
            }`
          }
        >
          <Settings size={16} className="shrink-0" />
          {!collapsed && <span>Settings</span>}
        </NavLink>
      </div>

      {user && (
        <div className="border-t border-border px-3 py-3">
          {!collapsed ? (
            <p className="truncate text-xs text-text-faint">{user.firm_name}</p>
          ) : (
            <span
              className="block h-2 w-2 rounded-pill bg-text-faint"
              aria-label={user.firm_name}
              title={user.firm_name}
            />
          )}
        </div>
      )}
    </aside>
  );
}
