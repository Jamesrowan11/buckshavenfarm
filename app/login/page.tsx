"use client";

import { useActionState } from "react";
import Link from "next/link";
import { loginAction } from "./actions";

export default function LoginPage() {
  const [state, formAction, pending] = useActionState(loginAction, null);

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

        <form action={formAction} className="card space-y-4">
          <div>
            <label className="label">Email</label>
            <input type="email" name="email" required autoComplete="email" className="input" defaultValue={state?.email ?? ""} key={state?.email ?? ""} />
          </div>
          <div>
            <label className="label">Password</label>
            <input type="password" name="password" required autoComplete="current-password" className="input" />
          </div>
          {state?.error && <div className="text-sm text-red-600">{state.error}</div>}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Signing in..." : "Sign in"}
          </button>
        </form>
        <p className="text-center text-sm text-stone-600 mt-4">
          First time here? <Link href="/setup" className="text-farm font-medium">Set your password</Link>
        </p>
      </div>
    </div>
  );
}
