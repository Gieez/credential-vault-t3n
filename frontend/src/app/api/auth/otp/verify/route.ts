import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "Email OTP is temporarily unavailable on this serverless deployment. Use T3N Developer Key login instead.",
    },
    { status: 503 }
  );
}
