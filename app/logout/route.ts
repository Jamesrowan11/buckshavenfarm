import { NextResponse } from "next/server";
import { signOut } from "@/lib/auth";
import { publicUrl } from "@/lib/publicUrl";

export async function POST(request: Request) {
  await signOut();
  return NextResponse.redirect(publicUrl(request.headers, "/login", request.url), { status: 303 });
}
