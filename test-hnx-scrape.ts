async function testHnxScrape() {
  const url = "https://hnx.vn/ModuleArticles/ArticlesCPEtfs/NextPageTinTCPHChuaGD_UpCoM";
  const body = new URLSearchParams({
    pNumPage: "1", pTieuDeTin: "", pFromDate: "", pToDate: "", pNumRecord: "10",
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

  console.log("Status:", res.status);
  const html = await res.text();
  console.log("Do dai HTML:", html.length);
  console.log("200 ky tu dau:", html.slice(0, 200));
}

testHnxScrape();
