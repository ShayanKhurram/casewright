import { useQuery } from "@tanstack/react-query";
import { LayoutDashboard, PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useState } from "react";
import { NavLink } from "react-router-dom";

import { apiFetch } from "../../lib/api";
import { CurrentUser } from "../../types";

const COLLAPSE_KEY = "casewright_sidebar_collapsed";

/** Nav items point only at routes that actually exist today. The redesign source names
 * "Dashboard, Cases, Knowledge, Settings" as the intended long-run nav (§4) — Knowledge
 * (precedent management) and Settings (firm/user admin) have no frontend surface yet, so
 * they're deliberately left out rather than linked to pages that don't exist. Extend this
 * array when those screens land. */
const NAV_ITEMS = [{ to: "/", label: "Dashboard", icon: LayoutDashboard }];

export default function Sidebar() {
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === "1");
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<CurrentUser>("/auth/me"),
  });

  useEffect(() => {
    localStorage.setItem(COLLAPSE_KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  return (
    <aside
      className={`flex h-screen flex-col border-r border-border bg-bg transition-all duration-panel ease-casewright ${
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
          </NavLink>
        ))}
      </nav>

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
