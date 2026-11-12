import { NextResponse } from "next/server";
import { destroySessionFromCookies, SESSION_COOKIE_NAME } from "@/lib/t3n-sessions";

export async function POST() {
  await destroySessionFromCookies();
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(SESSION_COOKIE_NAME);
  return res;
}
