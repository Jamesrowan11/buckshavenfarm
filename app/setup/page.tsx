"use client";

import { useActionState } from "react";
import Link from "next/link";
import { setupAction } from "../login/actions";

export default function SetupPage() {
  const [state, formAction, pending] = useActionState(setupAction, null);

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-gradient-to-b from-farm-50 to-stone-50 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-2xl font-bold text-stone-900">Set your password</h1>
          <p className="text-stone-600 text-sm mt-1">
            For the first sign-in. You need the setup code from your admin.
          </p>
        </div>
        <form action={formAction} className="card space-y-4">
          <div>
            <label className="label">Your email</label>
            <input type="email" name="email" required autoComplete="email" className="input" defaultValue={state?.email ?? ""} key={state?.email ?? ""} />
          </div>
          <div>
            <label className="label">Setup code</label>
            <input name="code" required autoComplete="off" className="input" />
          </div>
          <div>
            <label className="label">New password</label>
            <input type="password" name="password" required minLength={10} autoComplete="new-password" className="input" />
            <p className="text-xs text-stone-500 mt-1">At least 10 characters, with letters and numbers.</p>
          </div>
          <div>
            <label className="label">Confirm password</label>
            <input type="password" name="confirm" required minLength={10} autoComplete="new-password" className="input" />
          </div>
          {state?.error && <div className="text-sm text-red-600">{state.error}</div>}
          <button type="submit" disabled={pending} className="btn-primary w-full">
            {pending ? "Saving..." : "Set password and sign in"}
          </button>
        </form>
        <p className="text-center text-sm text-stone-600 mt-4">
          <Link href="/login" className="text-farm font-medium">Back to sign in</Link>
        </p>
      </div>
    </div>
  );
}
