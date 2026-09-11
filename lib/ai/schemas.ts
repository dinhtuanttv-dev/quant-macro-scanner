// lib/ai/schemas.ts
//
// NANG CAP (2026-09-11): Bang Tong Hop Tac Dong Co Phieu truoc day nhan
// "1 ket luan chung cho TAT CA nganh" (summaryVi/direction/confidence
// dung 1 gia tri ap cho ca mang affectedSectorKeys), dan den N nganh
// hien thi CUNG 1 doan text lap lai - vua sai ve tai chinh dinh luong
// (1 su kien vi mo thuong tac dong TRAI CHIEU giua cac nganh, VD Fed tang
// lai suat: tot cho Ngan hang, xau cho Bat dong san) vua gay UI dai dong,
// kho doc. Gio MOI nganh co direction/confidence/reasoning RIENG.

export const marketAgentSchema = {
  type: "object",
  properties: {
    overallSummaryVi: {
      type: "string",
      description: "1 cau tom tat TONG QUAN boi canh vi mo (hien 1 lan duy nhat o dau bang, KHONG lap lai o tung nganh)",
    },
    sectorImpacts: {
      type: "array",
      description: "Moi phan tu la 1 nganh bi anh huong, VOI direction/confidence/reasoning RIENG BIET cho tung nganh - KHONG dung chung 1 ket luan cho nhieu nganh, ke ca khi cung xuat phat tu 1 su kien.",
      items: {
        type: "object",
        properties: {
          sectorKey: {
            type: "string",
            description: "CHI duoc chon tu danh sach sectorKey hop le cung cap trong prompt, khong tu tao key moi",
          },
          direction: {
            type: "string",
            enum: ["bullish", "bearish", "neutral"],
            description: "Tac dong RIENG cho nganh nay - co the KHAC nganh khac trong cung phan tich (VD lai suat tang: Ngan hang bullish, Bat dong san bearish)",
          },
          confidence: { type: "number", description: "0 den 1 - do tin cay RIENG cho nganh nay" },
          reasoningVi: { type: "string", description: "1 cau ly do RIENG cho nganh nay - KHONG copy nguyen van tu nganh khac" },
          evidenceRefs: {
            type: "array", items: { type: "string" },
            description: "Bat buoc trich dan ID cua data point da dung de ket luan VE NGANH NAY",
          },
        },
        required: ["sectorKey", "direction", "confidence", "reasoningVi", "evidenceRefs"],
      },
    },
  },
  required: ["overallSummaryVi", "sectorImpacts"],
};

export const newsAgentSchema = {
  type: "object",
  properties: {
    headlineVi: { type: "string" },
    importanceLevel: { type: "string", enum: ["low", "medium", "high", "critical"] },
    sentimentScore: { type: "number", description: "-1 (rất tiêu cực) đến 1 (rất tích cực)" },
    sourceUrl: { type: "string", description: "BẮT BUỘC - URL nguồn tin thật, KHÔNG bịa" },
  },
  required: ["headlineVi", "importanceLevel", "sentimentScore", "sourceUrl"],
};

// NANG CAP: Evidence Agent gio kiem chung TUNG NGANH rieng biet (mot nganh
// co the "verified" trong khi nganh khac trong cung phan tich thi khong),
// thay vi 1 verified/finalConfidence chung cho ca phan tich.
export const evidenceAgentSchema = {
  type: "object",
  properties: {
    sectorVerifications: {
      type: "array",
      description: "Kiem chung TUNG phan tu trong sectorImpacts cua Market Agent, theo dung thu tu sectorKey tuong ung",
      items: {
        type: "object",
        properties: {
          sectorKey: { type: "string" },
          verified: { type: "boolean", description: "true neu evidenceRefs cua nganh nay THAT SU ton tai trong du lieu goc va ung ho ket luan" },
          finalConfidence: { type: "number", description: "PHAI <= confidence goc cua Market Agent cho nganh nay - khong duoc tu nang do tin cay" },
          discrepancies: { type: "array", items: { type: "string" } },
        },
        required: ["sectorKey", "verified", "finalConfidence", "discrepancies"],
      },
    },
    newsVerified: { type: "boolean", description: "true neu ket luan cua News Agent khop voi tin tuc goc da cung cap" },
    newsDiscrepancies: { type: "array", items: { type: "string" } },
  },
  required: ["sectorVerifications", "newsVerified", "newsDiscrepancies"],
};
