import { NextResponse } from "next/server";
export async function GET() {
  return NextResponse.json({
    prices: {},
    notice: "Test assets have no monetary value.",
  });
}
