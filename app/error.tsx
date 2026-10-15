"use client";

import Link from "next/link";

// Shown when a page or form action fails (e.g. invalid input or the database
// is briefly unreachable). Details are never shown to the user; they're in
// the server log.
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="min-h-[60vh] flex items-center justify-center p-4">
      <div className="card max-w-md w-full text-center space-y-3">
        <h1 className="h2">Something went wrong</h1>
        <p className="text-sm text-stone-600">
          That didn&apos;t work. Check what you entered and try again. If it keeps happening, the server may be
          temporarily unavailable.
        </p>
        <div className="flex justify-center gap-2">
          <button onClick={reset} className="btn-primary">
            Try again
          </button>
          <Link href="/" className="btn-secondary">
            Home
          </Link>
        </div>
      </div>
    </div>
  );
}
