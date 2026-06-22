"use server";

import { prisma } from "../prisma";
import { runMacroNewsFetch } from "./fetcher";

export async function triggerMacroFetch() {
  try {
    const summary = await runMacroNewsFetch();
    return summary;
  } catch (error) {
    console.error("triggerMacroFetch error:", error);
    throw new Error("Failed to fetch macro news");
  }
}

export async function getMacroNewsAction() {
  try {
    return await prisma.macroNewsRecord.findMany({
      orderBy: { publishedAt: "desc" },
      take: 50,
    });
  } catch (error) {
    console.error("getMacroNewsAction error:", error);
    throw new Error("Failed to load macro news");
  }
}
