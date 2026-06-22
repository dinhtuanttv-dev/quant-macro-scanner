const SECTOR_KEYWORDS: Record<string, string[]> = {
  Banking: ["ngan hang", "lai suat", "tin dung", "bank", "interest rate"],
  RealEstate: ["bat dong san", "chung cu", "real estate", "property"],
  Steel: ["thep", "steel", "hoa phat", "iron ore"],
  Oil_Gas: ["dau khi", "xang dau", "oil", "opec", "brent", "wti"],
  Securities: ["chung khoan", "cong ty chung khoan", "margin", "brokerage"],
  Export_Textile: ["det may", "textile", "garment", "xuat khau"],
  Technology: ["cong nghe", "semiconductor", "chip", "technology"],
  Agriculture: ["nong san", "lua gao", "ca phe", "agriculture", "commodity"],
};

const HIGH_IMPACT_KEYWORDS = ["khung hoang", "crisis", "sup do", "collapse", "chien tranh", "war", "sanction", "cam van", "pha san", "default", "fed", "fomc", "ngan hang nha nuoc"];
const MEDIUM_IMPACT_KEYWORDS = ["tang truong", "growth", "loi nhuan", "earnings", "xuat khau", "export", "fdi", "dau tu", "investment"];

function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function classifySectors(content: string): string[] {
  const lower = normalize(content);
  const matched: string[] = [];
  for (const [sector, keywords] of Object.entries(SECTOR_KEYWORDS)) {
    if (keywords.some((kw) => lower.includes(normalize(kw)))) {
      matched.push(sector);
    }
  }
  return matched.length > 0 ? matched : ["Macro_General"];
}

export function classifyImpact(content: string): number {
  const lower = normalize(content);
  const isNegative = /(giam|sut|khung hoang|crisis|sup do|collapse|pha san|default|cam van|sanction)/i.test(lower);
  let magnitude = 3;
  if (HIGH_IMPACT_KEYWORDS.some((kw) => lower.includes(normalize(kw)))) magnitude = 8;
  else if (MEDIUM_IMPACT_KEYWORDS.some((kw) => lower.includes(normalize(kw)))) magnitude = 5;
  return isNegative ? -magnitude : magnitude;
}

export function toSeverity(rawImpact: number): "low" | "medium" | "high" | "critical" {
  const abs = Math.abs(rawImpact);
  if (abs >= 8) return "critical";
  if (abs >= 5) return "high";
  if (abs >= 3) return "medium";
  return "low";
}