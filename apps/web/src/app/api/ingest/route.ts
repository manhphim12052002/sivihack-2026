import { NextResponse } from "next/server";

// Stub: tender ingest job — returns a placeholder job until Python pipeline is wired
export function POST() {
  return NextResponse.json(
    { error: "Tender ingest not yet implemented" },
    { status: 501 },
  );
}
