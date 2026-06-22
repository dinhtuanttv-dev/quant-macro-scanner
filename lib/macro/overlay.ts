// File: lib/macro/overlay.ts
import { prisma } from "../prisma";

export async function getOverlayData() {
  try {
    // Vi du su dung prisma tai day
    return await prisma.macroNewsRecord.findMany({
      take: 10,
    });
  } catch (error) {
    console.error("Database Error in overlay:", error);
    return [];
  }
}