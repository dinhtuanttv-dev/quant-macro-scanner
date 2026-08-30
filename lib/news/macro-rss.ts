import Parser from "rss-parser";

// MUC 3: Kich hoat News Agent that (truoc day luon nhan mang [] rong).
// Nguon: https://finance.yahoo.com/news/rssindex - da xac nhan qua nhieu
// nguon doc lap (GitHub open-source project, feedspot listing, ban dump
// XML thuc te gan day) - cung domain finance.yahoo.com da dung on dinh
// cho toan bo du lieu gia trong du an nay.

const parser = new Parser({
  timeout: 5000, // FIX: giam tu 8000 xuong 5000 - fail nhanh hon, tranh cong don qua maxDuration
  headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)" },
});

const YAHOO_FINANCE_NEWS_RSS = "https://finance.yahoo.com/news/rssindex";

export interface MacroNewsItem {
  title: string;
  url: string;
  publishedAt: string;
}

export async function fetchMacroNews(limit = 8): Promise<MacroNewsItem[]> {
  try {
    const feed = await parser.parseURL(YAHOO_FINANCE_NEWS_RSS);
    return (feed.items ?? [])
      .slice(0, limit)
      .map((item) => ({
        title: item.title ?? "",
        url: item.link ?? "",
        publishedAt: item.pubDate ?? item.isoDate ?? "",
      }))
      // Loai bo item thieu URL that - News Agent bat buoc phai co sourceUrl
      // that, khong duoc bia (dung yeu cau goc "KHONG tu tao URL").
      .filter((item) => item.title && item.url);
  } catch (err) {
    console.error("[fetchMacroNews] Loi fetch/parse RSS:", err);
    // Tra ve mang rong khi loi - KHONG throw, de runMultiAgentAnalysis van
    // chay duoc voi Market Agent (khong co News Agent), dung graceful
    // degradation da ap dung xuyen suot du an.
    return [];
  }
}
