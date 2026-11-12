import { NextResponse } from "next/server";
import { z } from "zod";
import { SESSION_COOKIE_NAME, signInWithPrivateKey } from "@/lib/t3n-sessions";

const schema = z.object({
  privateKey: z.string().min(16, "Enter a valid secp256k1 private key"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid key input" },
        { status: 400 }
      );
    }
    const session = await signInWithPrivateKey(parsed.data.privateKey);
    const res = NextResponse.json({ ok: true, did: session.did });
    res.cookies.set(SESSION_COOKIE_NAME, session.id, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 12,
    });
    return res;
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Key authentication failed";
    return NextResponse.json({ error: msg }, { status: 401 });
  }
}
