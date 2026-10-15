"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string; redirect?: string };
      if (!res.ok) {
        setLoading(false);
        setError(data.error ?? "Sign-in failed. Please try again.");
        return;
      }
      router.push(data.redirect ?? "/");
      router.refresh();
    } catch {
      setLoading(false);
      setError("Could not reach the server. Check your connection and try again.");
    }
  }

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-farm-50 to-stone-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="mx-auto h-16 w-16 rounded-2xl bg-farm text-white flex items-center justify-center text-3xl font-bold shadow-lg">
            B
          </div>
          <h1 className="mt-4 text-2xl font-bold text-stone-900">Bucks Haven Farm</h1>
          <p className="text-stone-600 text-sm mt-1">Operations portal</p>
        </div>

        <form onSubmit={onSubmit} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input
              type="email"
              required
              autoComplete="email"
              className="input"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div>
            <label className="label">Password</label>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="input"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <button type="submit" disabled={loading} className="btn-primary w-full">
            {loading ? "Signing in..." : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
