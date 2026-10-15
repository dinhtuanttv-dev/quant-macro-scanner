// X4 — Kiểm toán con số (tiêu chí G8 của gói MacroCenter): mọi con số trong câu trả lời phải truy ngược được tới kết quả
// công cụ (hoặc câu hỏi của người dùng). Chạy SAU khi trả lời xong; con số không truy được -> báo cho người dùng thấy.

const NUM_RE = /(?<![\p{L}\d])[-−]?\d+(?:[.,]\d+)*(?![\p{L}\d])/gu;

/** Các cách đọc có thể của một số viết kiểu Việt/Anh: "3,5" -> 3.5; "1.234,5" -> 1234.5; "1,234" -> 1.234 hoặc 1234. */
export function readings(raw: string): number[] {
  const s = raw.replace("−", "-");
  const out = new Set<number>();
  const hasDot = s.includes(".");
  const hasComma = s.includes(",");
  if (hasDot && hasComma) {
    out.add(Number(s.replace(/\./g, "").replace(",", ".")));
    out.add(Number(s.replace(/,/g, "")));
  } else if (hasComma) {
    out.add(Number(s.replace(",", ".")));
    out.add(Number(s.replace(/,/g, "")));
  } else if (hasDot) {
    out.add(Number(s));
    out.add(Number(s.replace(/\./g, "")));
  } else out.add(Number(s));
  return [...out].filter(Number.isFinite);
}

export function numbersIn(text: string): string[] {
  return text.match(NUM_RE) ?? [];
}

/** Gom mọi số trong một giá trị JSON (cả số nằm trong chuỗi). */
export function collectNumbers(v: unknown, into: number[] = []): number[] {
  if (typeof v === "number" && Number.isFinite(v)) into.push(v);
  else if (typeof v === "string") for (const m of numbersIn(v)) into.push(...readings(m));
  else if (Array.isArray(v)) for (const x of v) collectNumbers(x, into);
  else if (v && typeof v === "object") for (const x of Object.values(v)) collectNumbers(x, into);
  return into;
}

const close = (a: number, b: number) => Math.abs(a - b) <= 0.05 + 0.01 * Math.abs(b);

/** Một số trong câu trả lời được coi là truy được nếu khớp (sai số làm tròn) một số nguồn, hoặc ×100 / ÷100 (tỷ lệ <-> %). */
export function isTraceable(x: number, sources: number[]): boolean {
  const ax = Math.abs(x);
  return sources.some((s) => {
    const as = Math.abs(s);
    return close(ax, as) || close(ax, as * 100) || close(ax * 100, as);
  });
}

/**
 * Trả về các con số trong `answer` không truy được. Bỏ qua phần cấu trúc: số thứ tự đầu dòng, ngày/tháng/năm, mã chỉ số
 * (VN30, VN100 — bị regex loại do dính chữ), số nhỏ 0–12 nguyên (độ trễ tháng, số lượng, liệt kê).
 */
export function auditNumbers(answer: string, toolResults: unknown[], userText = ""): string[] {
  const sources = [...collectNumbers(toolResults), ...collectNumbers(userText)];
  const bad: string[] = [];
  const text = answer.replace(/^\s*\d+[.)]\s/gm, " "); // "1. ", "2) " đầu dòng
  for (const raw of numbersIn(text)) {
    const rs = readings(raw);
    if (!rs.length) continue;
    const plain = rs[0];
    if (Number.isInteger(plain) && Math.abs(plain) <= 12) continue;
    if (Number.isInteger(plain) && plain >= 1990 && plain <= 2100) continue; // năm
    if (rs.some((x) => isTraceable(x, sources))) continue;
    bad.push(raw);
  }
  return [...new Set(bad)];
}
