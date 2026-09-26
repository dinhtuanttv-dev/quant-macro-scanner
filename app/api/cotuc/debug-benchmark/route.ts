import { NextResponse } from "next/server";
import { fetchBenchmarkPricesOnce } from "@/lib/cotuc/timing-v3/compute-cycle-io";

// ROUTE DEBUG TAM THOI (khong phai tinh nang chinh thuc) - de CO LAP
// chinh xac buoc nao gay FUNCTION_INVOCATION_TIMEOUT: route nay CHI
// goi fetchBenchmarkPricesOnce() (buoc DAU TIEN cua ca cron va route
// don le), KHONG lam gi khac. Neu route NAY cung timeout, xac nhan
// van de o buoc lay gia VN-Index (VNDirect), KHONG PHAI so luong ma.
export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET() {
  const start = Date.now();
  const result = await fetchBenchmarkPricesOnce();
  const elapsedMs = Date.now() - start;

  if ("reason" in result) {
    return NextResponse.json({ elapsedMs, error: result.detail });
  }
  return NextResponse.json({ elapsedMs, soPhien: result.length, ngayDauTien: result[0]?.date, ngayCuoiCung: result[result.length - 1]?.date });
}
