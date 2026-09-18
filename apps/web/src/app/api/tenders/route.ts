import { NextResponse } from "next/server";
import { listTenders } from "@/lib/tender/db";

export async function GET() {
  return NextResponse.json(await listTenders(200));
}
