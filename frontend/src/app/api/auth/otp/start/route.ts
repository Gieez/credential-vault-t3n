import { NextResponse } from "next/server";
import { z } from "zod";
import { startEmailOtpLogin } from "@/lib/t3n-sessions";

const schema = z.object({
  email: z.string().email("Enter a valid email address"),
});

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const parsed = schema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.issues[0]?.message || "Invalid email" },
        { status: 400 }
      );
    }
    const result = await startEmailOtpLogin(parsed.data.email);
    return NextResponse.json({ ok: true, pendingId: result.pendingId });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to start Email OTP";
    return NextResponse.json({ error: msg }, { status: 400 });
  }
}
