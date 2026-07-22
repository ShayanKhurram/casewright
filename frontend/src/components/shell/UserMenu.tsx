import * as Popover from "@radix-ui/react-popover";
import { useQuery } from "@tanstack/react-query";
import { ChevronDown, LogOut } from "lucide-react";
import { useNavigate } from "react-router-dom";

import { apiFetch, clearToken } from "../../lib/api";
import { CurrentUser } from "../../types";

function initials(user: CurrentUser): string {
  const source = user.full_name?.trim() || user.email;
  const parts = source.split(/[\s@.]+/).filter(Boolean);
  const letters = parts.slice(0, 2).map((p) => p[0]?.toUpperCase() ?? "");
  return letters.join("") || "?";
}

/** Initials avatar + name + role pill (redesign §4/§1: "raw firm UUID never rendered" —
 * this is the direct fix, backed by /auth/me now resolving firm_name server-side). */
export default function UserMenu() {
  const navigate = useNavigate();
  const { data: user } = useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<CurrentUser>("/auth/me"),
  });

  function handleSignOut() {
    clearToken();
    navigate("/login");
  }

  if (!user) {
    return <div className="h-8 w-8 animate-pulse motion-reduce:animate-none rounded-full bg-surface-2" />;
  }

  return (
    <Popover.Root>
      <Popover.Trigger asChild>
        <button className="flex items-center gap-2 rounded-control px-2 py-1 text-sm text-text hover:bg-surface-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-pill bg-accent font-mono text-xs font-medium text-text">
            {initials(user)}
          </span>
          <ChevronDown size={14} className="text-text-faint" />
        </button>
      </Popover.Trigger>
      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-50 w-64 rounded-card border border-border bg-surface-2 p-3 shadow-elevated"
        >
          <p className="text-sm font-medium text-text">{user.full_name || user.email}</p>
          <p className="mt-0.5 truncate text-xs text-text-dim">{user.email}</p>
          <div className="mt-2 flex items-center gap-2">
            <span className="rounded-pill border border-border bg-surface px-2 py-0.5 font-mono text-[11px] uppercase text-text-dim">
              {user.role}
            </span>
            <span className="truncate text-xs text-text-faint">{user.firm_name}</span>
          </div>
          <div className="my-3 h-px bg-border" />
          <button
            onClick={handleSignOut}
            className="flex w-full items-center gap-2 rounded-control px-2 py-1.5 text-left text-sm text-text hover:bg-surface"
          >
            <LogOut size={14} />
            Sign out
          </button>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
