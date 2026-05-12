import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import EmptyState from "@/components/EmptyState";

export const dynamic = "force-dynamic";

async function setRole(id: string, role: "admin" | "employee") {
  "use server";
  const supabase = createClient();
  await supabase.from("profiles").update({ role }).eq("id", id);
  revalidatePath("/admin/employees");
}

async function updateName(id: string, formData: FormData) {
  "use server";
  const supabase = createClient();
  const name = String(formData.get("name") ?? "").trim();
  if (!name) return;
  await supabase.from("profiles").update({ name }).eq("id", id);
  revalidatePath("/admin/employees");
}

async function removeProfile(id: string) {
  "use server";
  const supabase = createClient();
  await supabase.from("profiles").delete().eq("id", id);
  revalidatePath("/admin/employees");
}

export default async function AdminEmployeesPage() {
  const supabase = createClient();
  const { data } = await supabase.from("profiles").select("*").order("role").order("name");

  return (
    <div className="space-y-6">
      <h1 className="h1">Employees & admins</h1>

      <div className="card text-sm text-stone-600">
        New users are created in the Supabase Dashboard (Authentication → Users → Add user). A profile row is
        auto-created on first sign-in. Promote/demote roles below.
      </div>

      {(data?.length ?? 0) === 0 ? (
        <EmptyState title="No profiles yet" hint="Add users in the Supabase dashboard first." />
      ) : (
        <ul className="space-y-2">
          {data!.map((p: any) => (
            <li key={p.id} className="card flex flex-wrap items-center gap-3 justify-between">
              <div className="flex-1 min-w-[200px]">
                <form action={updateName.bind(null, p.id)} className="flex gap-2 items-center">
                  <input name="name" defaultValue={p.name} className="input !py-1" />
                  <button className="btn-secondary !py-1 !px-3 text-sm">Save</button>
                </form>
                <div className="text-xs text-stone-500 mt-1">{p.email}</div>
              </div>
              <div className="flex items-center gap-2">
                <span className={`badge ${p.role === "admin" ? "badge-high" : "badge-low"}`}>{p.role}</span>
                {p.role === "admin" ? (
                  <form action={setRole.bind(null, p.id, "employee")}>
                    <button className="btn-secondary !py-1 !px-3 text-sm">Make employee</button>
                  </form>
                ) : (
                  <form action={setRole.bind(null, p.id, "admin")}>
                    <button className="btn-primary !py-1 !px-3 text-sm">Make admin</button>
                  </form>
                )}
                <form action={removeProfile.bind(null, p.id)}>
                  <button className="text-stone-400 hover:text-red-600 text-sm">Remove</button>
                </form>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
