import { useNavigate } from "react-router-dom";

import { clearToken, getToken } from "../lib/api";

interface JwtPayload {
  sub?: string;
  firm_id?: string;
  role?: string;
}

function decodeJwt(): JwtPayload | null {
  const token = getToken();
  if (!token) return null;
  try {
    const parts = token.split(".");
    if (parts.length < 2) return null;
    // base64url -> base64, then atob, then JSON.parse on the middle segment.
    const b64 = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    const json = decodeURIComponent(
      atob(b64)
        .split("")
        .map((c) => `%${("00" + c.charCodeAt(0).toString(16)).slice(-2)}`)
        .join(""),
    );
    return JSON.parse(json) as JwtPayload;
  } catch {
    return null;
  }
}

export default function Shell({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const user = decodeJwt();

  function handleSignOut() {
    clearToken();
    navigate("/login");
  }

  return (
    <div className="min-h-screen bg-paper">
      <header className="border-b border-hairline bg-ink">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-8 py-3">
          <span className="font-display text-lg text-paper">Casewright</span>
          {user && (
            <div className="flex items-center gap-3">
              {/* slate is ~2.9:1 on the dark ink header (fails AA even for large text) —
                  hairline is ~12.7:1, so it's used here instead of the usual secondary-text token */}
              <span className="font-mono text-xs text-hairline">
                {user.role ?? "—"} · {user.firm_id ?? "—"}
              </span>
              <button
                onClick={handleSignOut}
                className="rounded border border-hairline px-2 py-1 font-mono text-xs text-paper hover:opacity-90"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </header>
      {children}
    </div>
  );
}