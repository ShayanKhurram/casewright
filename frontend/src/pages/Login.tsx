import { FormEvent, useState } from "react";
import { useNavigate } from "react-router-dom";

import { login } from "../lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await login(email, password);
      navigate("/");
    } catch {
      setError("Incorrect email or password");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <form onSubmit={handleSubmit} className="w-full max-w-sm rounded border border-hairline p-8">
        <h1 className="mb-6 font-display text-2xl text-ink">Casewright</h1>
        <label className="mb-1 block text-sm text-slate" htmlFor="email">
          Email
        </label>
        <input
          id="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="mb-4 w-full rounded border border-hairline px-3 py-2 focus:outline-none focus:ring-2 focus:ring-oxblood"
          required
        />
        <label className="mb-1 block text-sm text-slate" htmlFor="password">
          Password
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="mb-4 w-full rounded border border-hairline px-3 py-2 focus:outline-none focus:ring-2 focus:ring-oxblood"
          required
        />
        {error && <p className="mb-4 text-sm text-verdict-gap">{error}</p>}
        <button
          type="submit"
          className="w-full rounded bg-oxblood py-2 text-paper hover:opacity-90 focus:outline-none focus:ring-2 focus:ring-oxblood"
        >
          Sign in
        </button>
      </form>
    </div>
  );
}
