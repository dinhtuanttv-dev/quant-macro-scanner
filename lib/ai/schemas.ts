export const marketAgentSchema = {
  type: "object",
  properties: {
    summaryVi: { type: "string", description: "Tóm tắt 1-2 câu bằng tiếng Việt" },
    affectedSectorKeys: {
      type: "array", items: { type: "string" },
      description: "CHỈ chọn từ danh sách sectorKey hợp lệ được cung cấp trong prompt, KHÔNG tự tạo key mới",
    },
    direction: { type: "string", enum: ["positive", "negative", "mixed"] },
    confidence: { type: "number", description: "0 đến 1 - độ tin cậy dựa trên chất lượng dữ liệu đầu vào" },
    evidenceRefs: {
      type: "array", items: { type: "string" },
      description: "Bắt buộc trích dẫn ID của data point đã dùng để kết luận",
    },
  },
  required: ["summaryVi", "affectedSectorKeys", "direction", "confidence", "evidenceRefs"],
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

export const evidenceAgentSchema = {
  type: "object",
  properties: {
    verified: { type: "boolean", description: "true nếu mọi con số khớp với dữ liệu nguồn" },
    discrepancies: { type: "array", items: { type: "string" } },
    finalConfidence: { type: "number" },
  },
  required: ["verified", "discrepancies", "finalConfidence"],
};
