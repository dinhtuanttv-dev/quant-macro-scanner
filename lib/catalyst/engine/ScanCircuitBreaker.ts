// lib/catalyst/engine/ScanCircuitBreaker.ts
//
// H2 - PHAT HIEN BI CHAN KHI SCRAPE HANG LOAT (Circuit Breaker Pattern).
//
// Van de goc: cafef-scraper.ts bat loi tung item rieng le (dung), nhung khong
// phat hien PATTERN "nhieu request lien tiep that bai" de dung som. Neu CafeF
// chan IP giua chung, code van chay het MAX_REPORTS_PER_SCAN=30, vua lang phi
// thoi gian (sat gioi han 10s Vercel) vua tang kha nang bi chan lau hon do tiep
// tuc gui request toi 1 server dang tu choi phuc vu.
//
// Circuit Breaker Pattern (chuan cong nghiep, dung rong rai trong microservices):
// 3 trang thai CLOSED (binh thuong) -> OPEN (da ngat, dung goi) -> [reset thu cong
// hoac theo thoi gian]. O day dung ban don gian hoa: dem loi LIEN TIEP, khi vuot
// nguong -> OPEN, dung vong lap NGAY, tra ve ket qua da co (khong throw, khong
// mat du lieu da scrape duoc truoc do).

export interface CircuitBreakerState {
  tripped: boolean;
  consecutiveFailures: number;
  totalFailures: number;
  totalAttempts: number;
}

export class ScanCircuitBreaker {
  private consecutiveFailures = 0;
  private totalFailures = 0;
  private totalAttempts = 0;
  private tripped = false;

  constructor(private readonly threshold: number = 5) {}

  public recordSuccess(): void {
    this.totalAttempts++;
    this.consecutiveFailures = 0; // reset dem lien tiep - chi quan tam loi LIEN TIEP
  }

  public recordFailure(): void {
    this.totalAttempts++;
    this.totalFailures++;
    this.consecutiveFailures++;
    if (this.consecutiveFailures >= this.threshold) {
      this.tripped = true;
    }
  }

  public isTripped(): boolean {
    return this.tripped;
  }

  public getState(): CircuitBreakerState {
    return {
      tripped: this.tripped,
      consecutiveFailures: this.consecutiveFailures,
      totalFailures: this.totalFailures,
      totalAttempts: this.totalAttempts,
    };
  }

  public reset(): void {
    this.consecutiveFailures = 0;
    this.tripped = false;
  }
}

// Ghi lai lan circuit breaker bi trip vao Redis de theo doi lich su (quan trong de
// phat hien pattern: neu CafeF chan minh 3 ngay lien tiep cung 1 khung gio, day la
// tin hieu can dieu chinh chien luoc scrape - vd giam tan suat, doi User-Agent...).
import { Redis } from "@upstash/redis";

const redis = new Redis({
  url: process.env.KV_REST_API_URL!,
  token: process.env.KV_REST_API_TOKEN!,
});

const TRIP_LOG_KEY = "catalyst:scraper:circuit_breaker_log";

export async function logCircuitBreakerTrip(
  scraperName: string,
  state: CircuitBreakerState
): Promise<void> {
  try {
    await redis.lpush(TRIP_LOG_KEY, JSON.stringify({
      scraperName,
      timestamp: new Date().toISOString(),
      ...state,
    }));
    await redis.ltrim(TRIP_LOG_KEY, 0, 49); // chi giu 50 su kien gan nhat
  } catch (err) {
    console.warn("[ScanCircuitBreaker] Khong ghi duoc log trip vao Redis:", err);
  }
}
