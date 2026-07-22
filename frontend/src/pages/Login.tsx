import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import Button from "../components/ui/Button";
import FieldError from "../components/ui/FieldError";
import Input from "../components/ui/Input";
import Label from "../components/ui/Label";
import { login } from "../lib/api";

/** Split layout per redesign plan §8: a dark `surface` brand panel (left, 45% on wide
 * viewports) and a centered login card (right). Both panels paint their own `bg-*`, so this
 * page renders correctly regardless of `body`'s legacy light theme. The plan calls for a
 * "subtle animated hairline grid" on the left panel; implemented here as a static hairline grid
 * (no keyframe) rather than adding a new animation + its own reduced-motion carve-out for a
 * background flourish — trivially satisfies "reduced-motion: static" by never animating. */
export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login(email, password);
      navigate("/");
    } catch (err) {
      // login() throws a fixed "Incorrect email or password" Error on a non-OK response; a
      // TypeError here instead means fetch itself failed (offline/DNS/CORS), not a bad
      // credential — worth distinguishing per the plan's error-taxonomy principle.
      if (err instanceof TypeError) {
        setError("Can't reach the server — check your connection and try again.");
      } else {
        setError(err instanceof Error ? err.message : "Sign-in failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen bg-bg">
      <div
        className="relative hidden w-[45%] shrink-0 flex-col justify-between overflow-hidden bg-surface p-12 lg:flex"
        style={{
          backgroundImage:
            "linear-gradient(var(--hairline) 1px, transparent 1px), linear-gradient(90deg, var(--hairline) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      >
        <div>
          <h1 className="font-display text-3xl text-text">Casewright</h1>
          <p className="mt-3 max-w-xs text-sm text-text-dim">
            The argumentation engine for O-1A and EB-1A petitions and RFE responses — built
            behind attorney review at every gate.
          </p>
        </div>
        <p className="font-mono text-xs text-text-faint">
          Firm-scoped. Audited. Never files without you.
        </p>
      </div>

      <div className="flex flex-1 items-center justify-center p-8">
        <form onSubmit={handleSubmit} className="w-full max-w-sm">
          <h2 className="mb-1 font-display text-2xl text-text lg:hidden">Casewright</h2>
          <p className="mb-6 text-sm text-text-dim">Sign in to your firm's workspace.</p>

          <div className="mb-4">
            <Label htmlFor="email" className="mb-1.5 block">
              Email
            </Label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>

          <div className="mb-2">
            <Label htmlFor="password" className="mb-1.5 block">
              Password
            </Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          <FieldError className="mb-2">{error}</FieldError>

          <Button type="submit" loading={submitting} className="mt-4 w-full justify-center">
            Sign in
          </Button>
        </form>
      </div>
    </div>
  );
}
