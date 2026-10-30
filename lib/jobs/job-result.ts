// Kết quả một job nền (cron) — dùng chung cho route Next.js (Vercel, gọi tay) và Market Gateway (Railway, lịch chạy chính).
export interface JobResult { status: number; body: Record<string, unknown> }

export const jobOk = (body: Record<string, unknown>): JobResult => ({ status: 200, body });
export const jobFail = (body: Record<string, unknown>, status = 500): JobResult => ({ status, body });

/** Bearer CRON_SECRET (trống = không khoá, như các route cron cũ). */
export function cronAuthorized(req: Request): boolean {
  const secret = process.env.CRON_SECRET;
  return !secret || req.headers.get("authorization") === `Bearer ${secret}`;
}
