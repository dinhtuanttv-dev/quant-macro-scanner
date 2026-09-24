// fmin khong co type declaration built-in (thu vien JS thuan, khong
// phai TS) - khai bao thu cong CHI CAC HAM DUNG DEN (nelderMead), dua
// dung theo API da xac nhan qua test thuc te truoc khi viet module nay.
declare module "fmin" {
  export interface NelderMeadResult { x: number[]; fx: number; }
  export interface NelderMeadOptions { maxIterations?: number; minErrorDelta?: number; }
  export function nelderMead(
    f: (x: number[]) => number,
    initial: number[],
    options?: NelderMeadOptions
  ): NelderMeadResult;
}
