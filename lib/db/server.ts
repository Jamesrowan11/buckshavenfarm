import { currentUser } from "@/lib/auth";
import type { Me } from "./policies";
import { Query } from "./query";

// Replacement for the old Supabase server client. Pages keep the same calls:
//   const db = createClient(); await db.from("tasks").select("*")...
// Every query runs with the signed-in person's permissions (lib/db/policies.ts).

type Client = {
  from: (table: string) => Query;
  auth: { getUser: () => Promise<{ data: { user: { id: string; email: string } | null } }> };
};

export function createClient(): Client {
  let mePromise: Promise<Me> | null = null;
  const me = () => (mePromise ??= currentUser());
  return {
    from(table: string) {
      return new LazyQuery(table, me) as unknown as Query;
    },
    auth: {
      async getUser() {
        const m = await me();
        return { data: { user: m ? { id: m.id, email: m.email } : null } };
      },
    },
  };
}

export async function getSessionAndProfile() {
  const m = await currentUser();
  if (!m) return { user: null, profile: null };
  return { user: { id: m.id, email: m.email }, profile: { id: m.id, name: m.name, email: m.email, role: m.role } };
}

/** Records the builder calls, then runs them once the signed-in user is known. */
class LazyQuery {
  private calls: [string, unknown[]][] = [];
  constructor(private table: string, private me: () => Promise<Me>) {
    return new Proxy(this, {
      get(target, prop, receiver) {
        if (prop === "then") {
          return (res: (v: unknown) => unknown, rej: (e: unknown) => unknown) =>
            target.me().then((m) => {
              let q: any = new Query(target.table, m);
              for (const [name, args] of target.calls) q = q[name](...args);
              return q.then(res, rej);
            }, rej);
        }
        if (typeof prop === "string" && prop in Query.prototype) {
          return (...args: unknown[]) => {
            target.calls.push([prop, args]);
            return receiver;
          };
        }
        return Reflect.get(target, prop, receiver);
      },
    });
  }
}
