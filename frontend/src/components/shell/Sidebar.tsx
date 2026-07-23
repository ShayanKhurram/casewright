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
  X,
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

export interface SidebarProps {
  /** Whether the mobile off-canvas drawer is open. Ignored at `lg` and above, where the sidebar
   * is always in-flow (collapse/expand only, the pre-existing desktop behavior). */
  mobileOpen: boolean;
  onMobileClose: () => void;
}

/** Responsive pass: below `lg`, this renders as a `fixed` off-canvas drawer (translated
 * off-screen when closed, sliding in over a dim backdrop when open) instead of a static
 * in-flow column — a 224px sidebar permanently eating width on a phone-width viewport was the
 * single biggest responsive gap in the app. At `lg` and above it's the original static
 * collapse/expand column, unchanged. Both modes share the same JSX; only the wrapper's
 * position/transform classes and the backdrop differ by breakpoint. */
export default function Sidebar({ mobileOpen, onMobileClose }: SidebarProps) {
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

  // Close the drawer on route change (any nav link click) — handled by onMobileClose being
  // passed straight to NavLink's onClick below, not a route-change effect, since that would
  // also fire on first mount if the drawer happened to already be open.
  const navContent = (
    <>
      <div className="flex h-14 items-center justify-between px-3">
        {!collapsed && <span className="font-display text-lg text-text">Casewright</span>}
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCollapsed((c) => !c)}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className="hidden rounded-control p-1.5 text-text-faint hover:bg-surface-2 hover:text-text lg:block"
          >
            {collapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}
          </button>
          <button
            onClick={onMobileClose}
            aria-label="Close menu"
            className="rounded-control p-1.5 text-text-faint hover:bg-surface-2 hover:text-text lg:hidden"
          >
            <X size={18} />
          </button>
        </div>
      </div>

      <nav className="flex-1 px-2 py-2">
        {NAV_ITEMS.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            end
            onClick={onMobileClose}
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
          onClick={onMobileClose}
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
    </>
  );

  return (
    <>
      {/* Backdrop — mobile only, only rendered when the drawer is open. Clicking it closes the
          drawer, same as clicking a nav link. */}
      {mobileOpen && (
        <div
          onClick={onMobileClose}
          aria-hidden
          className="fixed inset-0 z-30 bg-bg/70 lg:hidden"
        />
      )}
      <aside
        className={[
          "flex flex-col border-r border-border bg-surface transition-all duration-panel ease-casewright",
          // Mobile: fixed off-canvas drawer, slides in from the left over the backdrop above.
          // Desktop (lg+): back to the original static in-flow column, transform reset to none
          // so `collapsed`'s width transition (the pre-existing desktop behavior) still animates
          // smoothly instead of fighting a leftover translate-x.
          "fixed inset-y-0 left-0 z-40 w-64 -translate-x-full lg:static lg:z-auto lg:translate-x-0",
          mobileOpen ? "translate-x-0" : "",
          collapsed ? "lg:w-14" : "lg:w-56",
        ].join(" ")}
      >
        {navContent}
      </aside>
    </>
  );
}
