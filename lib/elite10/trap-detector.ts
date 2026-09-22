// PORT TRUC TIEP tu trap_detector.py (Phan II/VII - Vung 2 badge da khung
// thoi gian + phat hien bay gia). Tach rieng khoi scoring vi day la OUTPUT
// HIEN THI (badge), khong phai so hang cong vao Score_normalized.
import { bullTrapDetected, type ConfluenceProfile } from "./confluence-scoring";

export interface MultiTimeframeBadge {
  weekly: string; daily: string; h1: string; consensus: string; label: string;
}

export function multiTimeframeBadge(weekly: string, daily: string, h1: string): MultiTimeframeBadge {
  const votes = [weekly, daily, h1];
  const upVotes = votes.filter((v) => v === "up").length;
  let consensus: string, label: string;
  if (upVotes === 3) { consensus = "full"; label = "Đồng thuận toàn bộ 3/3 khung thời gian"; }
  else if (upVotes === 2) { consensus = "partial"; label = "Đồng thuận một phần 2/3 khung thời gian"; }
  else if (upVotes === 1) { consensus = "weak"; label = "Tín hiệu yếu, chỉ 1/3 khung thời gian"; }
  else { consensus = "none"; label = "Không có đồng thuận tăng giá"; }
  return { weekly, daily, h1, consensus, label };
}

export function riskFlagsFor(profile: ConfluenceProfile): string[] {
  const flags: string[] = [];
  if (bullTrapDetected(profile)) flags.push("bull_trap_warning");
  if ((profile.taMeta.elliottAltCounts ?? 0) >= 2) flags.push("elliott_ambiguous");
  if (profile.syncStatus !== "OK") flags.push("snapshot_degraded");
  return flags;
}
