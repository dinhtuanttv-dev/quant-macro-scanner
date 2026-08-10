// app/api/pins/route.ts
// Luu/doc ghim su kien vao ma co phieu qua Redis, dung 1 key duy nhat
// "quant:pinned-events" - tai dung Redis client cung cach da lam voi catalyst:watchlist.

import { NextRequest, NextResponse } from "next/server";
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const PINS_KEY = "quant:pinned-events";

export async function GET() {
  try {
    const pins = await redis.get<Record<string, string>>(PINS_KEY);
    return NextResponse.json({ pins: pins ?? {} });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { ticker, eventId } = await req.json();
    if (!ticker || !eventId) {
      return NextResponse.json({ error: "Thieu ticker hoac eventId" }, { status: 400 });
    }

    const pins = (await redis.get<Record<string, string>>(PINS_KEY)) ?? {};
    pins[ticker] = eventId;
    await redis.set(PINS_KEY, pins);

    return NextResponse.json({ ok: true, pins });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const { ticker } = await req.json();
    if (!ticker) {
      return NextResponse.json({ error: "Thieu ticker" }, { status: 400 });
    }

    const pins = (await redis.get<Record<string, string>>(PINS_KEY)) ?? {};
    delete pins[ticker];
    await redis.set(PINS_KEY, pins);

    return NextResponse.json({ ok: true, pins });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
