// Cong thuc dieu chinh gia ky thuat (P_adj) day du - co tinh thue TNCN
// co tuc tien mat + ty le co phieu thuong/ESOP.
//
// P_adj = (P - Co_tuc_tien_mat_SAU_thue) / (1 + Tong_ty_le_thuong_va_ESOP)
//
// Thue TNCN co tuc tien mat tai VN: 5% khau tru tai nguon (co dinh theo
// luat hien hanh). Co tuc/thuong bang co phieu HOAN THUE den khi ban,
// KHONG tinh thue o buoc dieu chinh gia ky thuat nay.

export const CASH_DIVIDEND_TAX_RATE = 0.05;

export interface PriceAdjustmentInput {
  rawPrice: number;
  cashDividendPerShare: number; // VND/CP, TRUOC thue (valuePerShare tu VCI)
  bonusAndEsopRatio: number;    // Tong ty le CP thuong + CP thuong tu co tuc + ESOP (VD 0.1 = 10%)
}

export function calculateAdjustedPrice(input: PriceAdjustmentInput): number {
  const afterTaxCash = input.cashDividendPerShare * (1 - CASH_DIVIDEND_TAX_RATE);
  return (input.rawPrice - afterTaxCash) / (1 + input.bonusAndEsopRatio);
}
