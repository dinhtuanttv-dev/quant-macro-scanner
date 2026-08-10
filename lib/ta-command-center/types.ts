// lib/ta-command-center/types.ts
// Tach rieng OhlcvBar thanh type dung chung cho module Command Center,
// KHONG phu thuoc lib/ta-drawing/* (mode SVG cu da bo qua theo quyet dinh).
export interface OhlcvBar {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}
