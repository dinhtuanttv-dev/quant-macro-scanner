import { NextRequest, NextResponse } from "next/server";
import { stockUniverse } from "@/lib/quant-data";
import { computeTang1 } from "@/lib/quant-funnel";
import { computeTang1WithScenario } from "@/lib/quant-funnel/computeTang1WithScenario";
import type { Scenario } from "@/lib/types/siu-quet-ai";

const VALID_SCENARIOS: Scenario[] = ["growth", "cautious", "defensive"];

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export async function OPTIONS() {
  return NextResponse.json(null, { status: 200, headers: corsHeaders });
}

export async function GET(req: NextRequest) {
  try {
    console.log("[tang1] Request received", {
      url: req.url,
      method: "GET",
      timestamp: new Date().toISOString(),
    });

    const scenarioParam = req.nextUrl.searchParams.get("scenario") ?? "growth";
    const scenario = VALID_SCENARIOS.includes(scenarioParam as Scenario)
      ? (scenarioParam as Scenario)
      : "growth";

    console.log("[tang1] Computing with scenario:", scenario);
    const tang1Result = computeTang1(stockUniverse);
    const tang1WithScenario = computeTang1WithScenario(tang1Result, scenario);

    console.log("[tang1] Success - returning", {
      resultCount: tang1Result.length,
      scenarioResultCount: tang1WithScenario.length,
    });

    return NextResponse.json(
      {
        tang1Result,
        tang1WithScenario,
        scenario,
        universeSize: stockUniverse.length,
      },
      { status: 200, headers: corsHeaders }
    );
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("[tang1] Error:", {
      error: errorMsg,
      stack: err instanceof Error ? err.stack : undefined,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json({ error: errorMsg }, { status: 500, headers: corsHeaders });
  }
}