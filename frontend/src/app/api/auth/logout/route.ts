import { NextResponse } from "next/server";
import { destroySessionFromCookies, SESSION_COOKIE_NAME } from "@/lib/t3n-sessions";

export async function POST() {
  try {
    await destroySessionFromCookies();
    const res = NextResponse.json({ ok: true });
    res.headers.set("Cache-Control", "no-store");
    res.cookies.set(SESSION_COOKIE_NAME, "", {
      httpOnly: true, secure: process.env.NODE_ENV === "production",
      sameSite: "strict", path: "/", maxAge: 0,
    });
    return res;
  } catch {
    return NextResponse.json(
      { error: "Session revocation unavailable. Please retry logout." },
      { status: 503, headers: { "Cache-Control": "no-store" } }
    );
  }
}
