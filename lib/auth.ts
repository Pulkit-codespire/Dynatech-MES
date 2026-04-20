import { NextResponse } from "next/server";

export function checkApiKey(req: Request): NextResponse | null {
  const expected = process.env.DEVICE_API_KEY;
  if (!expected) {
    return NextResponse.json(
      { status: "error", message: "DEVICE_API_KEY not configured" },
      { status: 500 }
    );
  }
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/i.exec(header);
  const provided = match?.[1]?.trim();
  if (!provided || provided !== expected) {
    return NextResponse.json(
      { status: "error", message: "unauthorized" },
      { status: 401 }
    );
  }
  return null;
}
