import { NextResponse } from "next/server";
import { fetchPublicTraction } from "@/lib/t3n-sessions";

export async function GET() {
  const data = await fetchPublicTraction(40);
  return NextResponse.json(data);
}
