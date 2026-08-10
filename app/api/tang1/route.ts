import { NextRequest, NextResponse } from "next/server";
import { stockUniverse } from "@/lib/quant-data";
import { computeTang1 } from "@/lib/quant-funnel";
import { computeTang1WithScenario } from "@/lib/quant-funnel/computeTang1WithScenario";
import type { Scenario } from "@/lib/types/siu-quet-ai";

const VALID_SCENARIOS: Scenario[] = ["growth", "cautious", "defensive"];

export async function GET(req: NextRequest) {
  try {
    const scenarioParam = req.nextUrl.searchParams.get("scenario") ?? "growth";
    const scenario = VALID_SCENARIOS.includes(scenarioParam as Scenario)
      ? (scenarioParam as Scenario)
      : "growth";

    const tang1Result = computeTang1(stockUniverse);
    const tang1WithScenario = computeTang1WithScenario(tang1Result, scenario);

    return NextResponse.json({
      tang1Result,
      tang1WithScenario,
      scenario,
      universeSize: stockUniverse.length,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}