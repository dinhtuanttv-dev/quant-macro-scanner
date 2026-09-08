async function testHnxScrape2() {
  const url = "https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinTCPHChuaGD_UpCoM";
  const body = new URLSearchParams({
    pNumPage: "1", pTieuDeTin: "", pFromDate: "", pToDate: "", pNumRecord: "5",
  });

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      "Referer": "https://hnx.vn/vi-vn/thong-tin-cong-bo-up-hnx.html",
      "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36",
    },
    body: body.toString(),
  });

  const html = await res.text();
  require("fs").writeFileSync("hnx-response-sample.html", html, "utf-8");
  console.log("Da luu file hnx-response-sample.html, do dai:", html.length);
}

testHnxScrape2();
