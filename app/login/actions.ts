"use server";

import { redirect } from "next/navigation";
import { signIn, setFirstPassword } from "@/lib/auth";

// The email is sent back with any error so the form can keep it filled in
// (React clears a form after it's submitted).
export type FormState = { error: string; email: string } | null;

export async function loginAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const error = await signIn(email, String(formData.get("password") ?? ""));
  if (error) return { error, email };
  redirect("/");
}

export async function setupAction(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = String(formData.get("email") ?? "");
  const password = String(formData.get("password") ?? "");
  if (password !== String(formData.get("confirm") ?? "")) return { error: "The passwords don't match.", email };
  const error = await setFirstPassword(email, String(formData.get("code") ?? ""), password);
  if (error) return { error, email };
  redirect("/");
}
