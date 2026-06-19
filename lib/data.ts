import {
  TickerItem,
  UniverseStock,
  GlobalIndexSector,
  CommodityImpact,
  SectorCatalyst,
  BlackSwanEvent,
  RrgSector,
  TaSignal,
  EliteDetail,
  MacroNews,
} from "./types";

// ============ TICKER MARQUEE DATA ============
export const initialTickerData: TickerItem[] = [
  { name: "VN-Index", value: 1268.4, change: 0.62 },
  { name: "Dow Jones", value: 39120, change: 0.45 },
  { name: "S&P 500", value: 5430, change: 0.32 },
  { name: "Nasdaq", value: 17750, change: 0.68 },
  { name: "DXY", value: 105.2, change: 0.08 },
  { name: "Vàng (Ounce)", value: 2325, change: 0.85, prefix: "$" },
  { name: "Dầu Brent", value: 82.6, change: 1.4, prefix: "$" },
  { name: "USD/VND", value: 25450, change: 0.04 },
  { name: "US 10Y Yield", value: 4.22, change: -0.5, suffix: "%" },
  { name: "VIX", value: 12.8, change: -2.3 },
  { name: "Nikkei 225", value: 38850, change: 1.12 },
  { name: "Hang Seng", value: 17940, change: -0.45 },
];

// ============ 60-STOCK UNIVERSE (Tang 0: Pho Quat) ============
export const stockUniverse: UniverseStock[] = [
  { ticker: "FPT", sector: "Công nghệ", epsGrowth: 24.5, faScore: 92 },
  { ticker: "PVS", sector: "Dầu khí", epsGrowth: 18.2, faScore: 86 },
  { ticker: "TCB", sector: "Ngân hàng", epsGrowth: 15.8, faScore: 84 },
  { ticker: "HAH", sector: "Vận tải biển", epsGrowth: 32.1, faScore: 88 },
  { ticker: "DGC", sector: "Hóa chất", epsGrowth: 21.4, faScore: 85 },
  { ticker: "GVR", sector: "Cao su", epsGrowth: 19.6, faScore: 83 },
  { ticker: "MWG", sector: "Bán lẻ", epsGrowth: 28.3, faScore: 81 },
  { ticker: "STB", sector: "Ngân hàng", epsGrowth: 14.2, faScore: 79 },
  { ticker: "NLG", sector: "Bất động sản", epsGrowth: 12.5, faScore: 78 },
  { ticker: "HPG", sector: "Thép", epsGrowth: 16.8, faScore: 77 },
  { ticker: "VCB", sector: "Ngân hàng", epsGrowth: 13.1, faScore: 82 },
  { ticker: "VHM", sector: "Bất động sản", epsGrowth: 9.4, faScore: 70 },
  { ticker: "VIC", sector: "Bất động sản", epsGrowth: 7.2, faScore: 65 },
  { ticker: "MBB", sector: "Ngân hàng", epsGrowth: 17.5, faScore: 80 },
  { ticker: "ACB", sector: "Ngân hàng", epsGrowth: 14.9, faScore: 76 },
  { ticker: "CTG", sector: "Ngân hàng", epsGrowth: 11.3, faScore: 71 },
  { ticker: "VPB", sector: "Ngân hàng", epsGrowth: 10.7, faScore: 68 },
  { ticker: "SSI", sector: "Chứng khoán", epsGrowth: 26.4, faScore: 79 },
  { ticker: "HCM", sector: "Chứng khoán", epsGrowth: 22.1, faScore: 75 },
  { ticker: "VND", sector: "Chứng khoán", epsGrowth: 20.8, faScore: 73 },
  { ticker: "PVD", sector: "Dầu khí", epsGrowth: 16.5, faScore: 74 },
  { ticker: "GAS", sector: "Dầu khí", epsGrowth: 8.9, faScore: 66 },
  { ticker: "PLX", sector: "Dầu khí", epsGrowth: 6.4, faScore: 60 },
  { ticker: "PHR", sector: "Cao su", epsGrowth: 15.3, faScore: 72 },
  { ticker: "DPR", sector: "Cao su", epsGrowth: 13.8, faScore: 69 },
  { ticker: "HSG", sector: "Thép", epsGrowth: 12.1, faScore: 67 },
  { ticker: "NKG", sector: "Thép", epsGrowth: 10.5, faScore: 64 },
  { ticker: "GMD", sector: "Vận tải biển", epsGrowth: 18.9, faScore: 77 },
  { ticker: "VOS", sector: "Vận tải biển", epsGrowth: 25.6, faScore: 70 },
  { ticker: "PVT", sector: "Vận tải biển", epsGrowth: 14.7, faScore: 71 },
  { ticker: "KDH", sector: "Bất động sản", epsGrowth: 8.1, faScore: 62 },
  { ticker: "DXG", sector: "Bất động sản", epsGrowth: 5.4, faScore: 55 },
  { ticker: "PDR", sector: "Bất động sản", epsGrowth: 4.2, faScore: 50 },
  { ticker: "DPM", sector: "Phân bón/Hóa chất", epsGrowth: -3.5, faScore: 48 },
  { ticker: "DCM", sector: "Phân bón/Hóa chất", epsGrowth: -1.8, faScore: 52 },
  { ticker: "VRE", sector: "Bán lẻ", epsGrowth: 9.7, faScore: 63 },
  { ticker: "PNJ", sector: "Bán lẻ", epsGrowth: 17.2, faScore: 76 },
  { ticker: "FRT", sector: "Bán lẻ", epsGrowth: 22.9, faScore: 73 },
  { ticker: "REE", sector: "Năng lượng/Điện", epsGrowth: 11.6, faScore: 68 },
  { ticker: "POW", sector: "Năng lượng/Điện", epsGrowth: 6.8, faScore: 58 },
  { ticker: "NT2", sector: "Năng lượng/Điện", epsGrowth: 5.1, faScore: 54 },
  { ticker: "VSH", sector: "Năng lượng/Điện", epsGrowth: 13.4, faScore: 65 },
  { ticker: "VJC", sector: "Hàng không", epsGrowth: 19.3, faScore: 71 },
  { ticker: "HVN", sector: "Hàng không", epsGrowth: -8.2, faScore: 40 },
  { ticker: "GEX", sector: "Khu công nghiệp", epsGrowth: 16.1, faScore: 70 },
  { ticker: "KBC", sector: "Khu công nghiệp", epsGrowth: 14.5, faScore: 72 },
  { ticker: "IDC", sector: "Khu công nghiệp", epsGrowth: 12.8, faScore: 69 },
  { ticker: "SZC", sector: "Khu công nghiệp", epsGrowth: 10.2, faScore: 64 },
  { ticker: "BCM", sector: "Khu công nghiệp", epsGrowth: 8.6, faScore: 61 },
  { ticker: "TNG", sector: "Dệt may", epsGrowth: 23.7, faScore: 74 },
  { ticker: "MSH", sector: "Dệt may", epsGrowth: 18.4, faScore: 70 },
  { ticker: "STK", sector: "Dệt may", epsGrowth: 9.9, faScore: 59 },
  { ticker: "VHC", sector: "Xuất khẩu (Gỗ, Thủy sản)", epsGrowth: 20.6, faScore: 75 },
  { ticker: "ANV", sector: "Xuất khẩu (Gỗ, Thủy sản)", epsGrowth: 15.9, faScore: 68 },
  { ticker: "FMC", sector: "Xuất khẩu (Gỗ, Thủy sản)", epsGrowth: 13.2, faScore: 66 },
  { ticker: "IMP", sector: "Dược phẩm", epsGrowth: 11.1, faScore: 63 },
  { ticker: "DHG", sector: "Dược phẩm", epsGrowth: 7.5, faScore: 57 },
  { ticker: "DBC", sector: "Nông nghiệp", epsGrowth: 26.8, faScore: 72 },
  { ticker: "HNG", sector: "Nông nghiệp", epsGrowth: -12.4, faScore: 35 },
  { ticker: "BMP", sector: "Vật liệu xây dựng", epsGrowth: 14.3, faScore: 67 },
  { ticker: "HT1", sector: "Vật liệu xây dựng", epsGrowth: 3.8, faScore: 48 },
];

// ============ GLOBAL INDICES & SECTOR AFFINITY (Tang 2) ============
export const globalIndicesSectors: GlobalIndexSector[] = [
  {
    index: "Dow Jones (DJI)",
    country: "Mỹ",
    sectors: ["Tài chính (Banks)", "Công nghiệp (Industrials)", "Năng lượng (Energy)"],
    vnSectorsFavored: ["Ngân hàng", "Thép", "Dầu khí"],
    rationale: "Phản ánh dòng tiền dịch chuyển sang các doanh nghiệp giá trị cơ bản bền vững.",
  },
  {
    index: "S&P 500",
    country: "Mỹ",
    sectors: ["Công nghệ thông tin", "Dịch vụ y tế", "Bán lẻ tiêu dùng"],
    vnSectorsFavored: ["Công nghệ", "Bán lẻ"],
    rationale: "Đại diện cho sức tiêu dùng hồi phục mạnh mẽ và chuyển dịch công nghệ toàn cầu.",
  },
  {
    index: "Nasdaq",
    country: "Mỹ",
    sectors: ["Bán dẫn (Semiconductors)", "AI & Điện toán đám mây", "Phần mềm"],
    vnSectorsFavored: ["Công nghệ", "Hóa chất"],
    rationale:
      "Bệ phóng dẫn dắt trực tiếp nhóm cung ứng hóa chất bán dẫn thượng nguồn và xuất khẩu phần mềm.",
  },
  {
    index: "DAX",
    country: "Đức",
    sectors: ["Hóa chất", "Chế tạo linh kiện điện tử", "Hạ tầng xanh"],
    vnSectorsFavored: ["Hóa chất", "Thép"],
    rationale: "Liên thông trực tiếp với mặt bằng xuất khẩu vật liệu hóa chất công nghiệp châu Âu.",
  },
  {
    index: "FTSE 100",
    country: "Anh",
    sectors: ["Khai thác tài nguyên", "Năng lượng hóa thạch", "Tài chính"],
    vnSectorsFavored: ["Ngân hàng", "Dầu khí"],
    rationale:
      "Sự phục hồi mạnh của nhóm hạ tầng năng lượng tạo động lực cho các mảng dịch vụ dầu khí Việt Nam.",
  },
  {
    index: "Nikkei 225",
    country: "Nhật Bản",
    sectors: ["Thiết bị tự động hóa", "Chuỗi siêu thị tiện ích", "Linh kiện điện tử"],
    vnSectorsFavored: ["Công nghệ", "Bán lẻ"],
    rationale:
      "Sự trỗi dậy của các chuỗi phân phối Đông Á thúc đẩy mạnh mẽ cho mảng bán lẻ thiết bị công nghệ.",
  },
  {
    index: "Hang Seng (HSI)",
    country: "Hồng Kông",
    sectors: ["Công nghệ Internet", "Phát triển Bất động sản", "Bảo hiểm lớn"],
    vnSectorsFavored: ["Bất động sản", "Ngân hàng"],
    rationale: "Hỗ trợ niềm tin cho sự ấm lên của phân khúc bất động sản nhà ở tại khu vực châu Á.",
  },
  {
    index: "Shanghai Composite",
    country: "Trung Quốc",
    sectors: ["Vật liệu bán dẫn mới", "Xe điện & Pin", "Ngân hàng quốc doanh"],
    vnSectorsFavored: ["Hóa chất", "Ngân hàng"],
    rationale: "Thúc đẩy giá vật liệu công nghiệp đầu vào phục vụ sản xuất pin và bo mạch điện tử.",
  },
  {
    index: "CAC 40",
    country: "Pháp",
    sectors: ["Hàng tiêu dùng cao cấp", "Hàng không & Quốc phòng", "Dược phẩm"],
    vnSectorsFavored: ["Bán lẻ", "Vận tải biển"],
    rationale: "Dòng tiền tập trung mạnh mẽ vào mảng hậu cần chuỗi bán lẻ quốc tế lớn.",
  },
  {
    index: "KOSPI",
    country: "Hàn Quốc",
    sectors: ["Chip bộ nhớ (RAM/NAND)", "Công nghiệp đóng tàu", "Hóa chất công nghiệp"],
    vnSectorsFavored: ["Công nghệ", "Hóa chất", "Vận tải biển"],
    rationale:
      "Chu kỳ siêu bùng nổ của chuỗi cung ứng bán dẫn và vận tải xuất khẩu linh kiện sang Đông Á.",
  },
];

// ============ COMMODITY IMPACT MATRIX (Tang 2) ============
export const commoditiesImpact: CommodityImpact[] = [
  {
    id: "oil",
    name: "Giá Dầu Brent (Thô)",
    category: "Năng lượng",
    price: "$82.60",
    change: "+1.40%",
    trend: "Up",
    sectorFavored: "Dầu khí",
    transmission:
      "Tác động trực tiếp đến giá dịch vụ giàn khoan và giá trị backlog của các gói thầu EPC thượng nguồn.",
  },
  {
    id: "rubber",
    name: "Giá Cao Su Thế Giới (TOCOM)",
    category: "Nông nghiệp / Công nghiệp",
    price: "278.4 JPY/kg",
    change: "+2.85%",
    trend: "Up",
    sectorFavored: "Cao su",
    transmission:
      "Đẩy cao trực tiếp biên lợi nhuận mủ cao su tự nhiên và nâng định giá chuyển đổi đất nông nghiệp sang KCN.",
  },
  {
    id: "freight",
    name: "Chỉ số Cước Vận Tải Container (Drewry)",
    category: "Logistics",
    price: "4,812 USD/FEU",
    change: "+5.20%",
    trend: "Up",
    sectorFavored: "Vận tải biển",
    transmission:
      "Bất ổn tại Biển Đỏ đẩy giá cước vận tải giao ngay tăng vọt, doanh nghiệp cho thuê tàu container hưởng lợi.",
  },
  {
    id: "phosphorus",
    name: "Giá Phốt Pho Vàng (Yellow Phosphorus)",
    category: "Hóa chất công nghệ cao",
    price: "¥23,500/tấn",
    change: "+1.95%",
    trend: "Up",
    sectorFavored: "Hóa chất",
    transmission:
      "Nhu cầu hóa chất sản xuất Chip bán dẫn và Pin LFP bùng nổ kéo biên lợi nhuận gộp mảng xuất khẩu tăng mạnh.",
  },
  {
    id: "hrc",
    name: "Giá Thép Cuộn Cán Nóng (HRC)",
    category: "Kim loại",
    price: "$585/tấn",
    change: "+0.45%",
    trend: "Neutral",
    sectorFavored: "Thép",
    transmission:
      "Giá thép thế giới phục hồi hỗ trợ giá xuất khẩu thép xây dựng và tôn mạ phục hồi tích cực.",
  },
  {
    id: "urea",
    name: "Giá Phân Bón Urea (FOB Trung Quốc)",
    category: "Hóa chất nông nghiệp",
    price: "$352/tấn",
    change: "-1.80%",
    trend: "Down",
    sectorFavored: "Phân bón/Hóa chất",
    transmission:
      "Trung Quốc mở lại hạn ngạch xuất khẩu khiến nguồn cung dồi dào, gây áp lực lên giá bán nội địa.",
  },
];

// ============ 15-SECTOR CATALYST RADAR (Tang 3 — suc manh xung luc) ============
export const sectorsData: SectorCatalyst[] = [
  { name: "Ngân hàng", catalyst: "Tăng trưởng tín dụng hồi phục, Thông tư 02 gia hạn", status: "Positive", strength: 75, flow: "Institutional" },
  { name: "Bất động sản", catalyst: "Luật Đất Đai sửa đổi có hiệu lực sớm, tháo gỡ pháp lý", status: "Neutral", strength: 48, flow: "Retail" },
  { name: "Chứng khoán", catalyst: "Hệ thống KRX chạy thử nghiệm nâng cao, thanh khoản phục hồi", status: "Strong Positive", strength: 88, flow: "High-Net-Worth" },
  { name: "Thép", catalyst: "Giá HRC thế giới phục hồi, áp thuế chống bán phá giá", status: "Positive", strength: 70, flow: "Institutional" },
  { name: "Dầu khí", catalyst: "Chuỗi dự án Lô B Ô Môn thúc đẩy backlog các năm tới", status: "Strong Positive", strength: 82, flow: "Foreigner" },
  { name: "Xuất khẩu (Gỗ, Thủy sản)", catalyst: "Đơn hàng phục hồi từ Mỹ/EU, hưởng lợi tỷ giá cao", status: "Positive", strength: 68, flow: "Institutional" },
  { name: "Khu công nghiệp", catalyst: "FDI đăng ký mới tăng trưởng mạnh, xu hướng dịch chuyển chuỗi", status: "Strong Positive", strength: 85, flow: "Foreigner" },
  { name: "Năng lượng/Điện", catalyst: "Kế hoạch thực hiện Quy hoạch điện VIII, hiện tượng La Nina", status: "Neutral", strength: 55, flow: "Defensive" },
  { name: "Đầu tư công", catalyst: "Chính phủ quyết liệt đẩy mạnh giải ngân vốn đầu tư công Q3-Q4", status: "Positive", strength: 72, flow: "Retail" },
  { name: "Bán lẻ", catalyst: "Giảm thuế VAT 2%, sức mua nội địa ấm dần lên", status: "Positive", strength: 64, flow: "Institutional" },
  { name: "Công nghệ", catalyst: "Chuyển đổi số toàn cầu, bùng nổ trung tâm dữ liệu AI & Bán dẫn", status: "Strong Positive", strength: 94, flow: "Institutional" },
  { name: "Phân bón/Hóa chất", catalyst: "Giá Urea phục hồi, kỳ vọng Luật thuế VAT đầu vào", status: "Neutral", strength: 52, flow: "Retail" },
  { name: "Vận tải biển", catalyst: "Cước vận tải biển toàn cầu neo cao do bất ổn kênh đào Suez", status: "Strong Positive", strength: 80, flow: "High-Net-Worth" },
  { name: "Dệt may", catalyst: "Đơn hàng ký mới kéo dài đến hết năm, chuyển dịch từ Bangladesh", status: "Positive", strength: 62, flow: "Retail" },
  { name: "Cao su", catalyst: "Giá cao su tăng mạnh do thiếu hụt nguồn cung tại Thái Lan", status: "Strong Positive", strength: 78, flow: "Institutional" },
  { name: "Hóa chất", catalyst: "Phốt pho vàng phục vụ bán dẫn bùng nổ nhu cầu xuất khẩu", status: "Strong Positive", strength: 81, flow: "Institutional" },
];

export const blackSwans: BlackSwanEvent[] = [
  {
    event: "FED bắt đầu hạ lãi suất chậm hơn kỳ vọng",
    channel: "DXY duy trì sức mạnh -> Áp lực tỷ giá USD/VND -> SBV phải giữ lãi suất cao",
    impact: "Tiêu cực cho ngành BĐS & Chứng khoán, Tích cực nhẹ cho Xuất khẩu",
  },
  {
    event: "Giá dầu Brent leo dốc vượt mốc $85/thùng",
    channel: "Chi phí vận tải tăng -> Lạm phát nhập khẩu -> Biên lợi nhuận biên thu hẹp",
    impact: "Hưởng lợi trực tiếp: Dầu khí. Bất lợi: Vận tải, Thủy sản",
  },
  {
    event: "Căng thẳng địa chính trị biển Đỏ leo thang",
    channel: "Giá cước container tăng vọt -> Thời gian giao hàng kéo dài",
    impact: "Hưởng lợi đột biến: Vận tải biển. Bất lợi: Xuất khẩu gỗ, dệt may",
  },
];

// ============ RRG SECTORS ============
export const rrgSectors: RrgSector[] = [
  { name: "Công nghệ", x: 230, y: 70, prevX: 180, prevY: 110, rs: 104.5, momentum: 102.3, quadrant: "Leading", color: "#34d399" },
  { name: "Dầu khí", x: 200, y: 110, prevX: 160, prevY: 135, rs: 102.8, momentum: 101.4, quadrant: "Leading", color: "#6ee7b7" },
  { name: "Vận tải biển", x: 190, y: 85, prevX: 155, prevY: 105, rs: 101.9, momentum: 101.2, quadrant: "Leading", color: "#60a5fa" },
  { name: "Ngân hàng", x: 130, y: 90, prevX: 95, prevY: 125, rs: 99.4, momentum: 100.8, quadrant: "Improving", color: "#38bdf8" },
  { name: "Cao su", x: 120, y: 130, prevX: 85, prevY: 150, rs: 98.7, momentum: 100.3, quadrant: "Improving", color: "#a7f3d0" },
  { name: "Thép", x: 80, y: 190, prevX: 70, prevY: 230, rs: 97.2, momentum: 98.6, quadrant: "Lagging", color: "#f87171" },
  { name: "Bất động sản", x: 95, y: 230, prevX: 125, prevY: 255, rs: 96.5, momentum: 97.4, quadrant: "Lagging", color: "#fb7185" },
  { name: "Bán lẻ", x: 175, y: 220, prevX: 210, prevY: 210, rs: 99.1, momentum: 98.1, quadrant: "Weakening", color: "#fbbf24" },
  { name: "Hóa chất", x: 215, y: 95, prevX: 175, prevY: 125, rs: 103.1, momentum: 101.6, quadrant: "Leading", color: "#2dd4bf" },
  { name: "Chứng khoán", x: 150, y: 75, prevX: 110, prevY: 115, rs: 100.6, momentum: 101.9, quadrant: "Improving", color: "#818cf8" },
];

// ============ TA SIGNAL POOL (Tang 4) ============
export const taSignalPool: Record<string, TaSignal> = {
  FPT: { pattern: "Nền phẳng dốc lên (CANSLIM)", breakout: true, volSpike: 2.4, foreignNet: 480.5, leader: true, ma50Status: "safe" },
  PVS: { pattern: "Wyckoff - SOS điểm tích lũy", breakout: true, volSpike: 1.9, foreignNet: -12.3, leader: false, ma50Status: "safe" },
  TCB: { pattern: "Cốc tay cầm (Cup & Handle)", breakout: false, volSpike: 1.3, foreignNet: 185.7, leader: true, ma50Status: "safe" },
  HAH: { pattern: "Độ biến động thu hẹp (VCP)", breakout: true, volSpike: 2.1, foreignNet: 45.2, leader: false, ma50Status: "safe" },
  DGC: { pattern: "Nền giá phẳng tích lũy 6 tháng", breakout: false, volSpike: 1.6, foreignNet: 112.4, leader: false, ma50Status: "safe" },
  GVR: { pattern: "Hồi phục từ điểm Spring (Wyckoff)", breakout: true, volSpike: 1.8, foreignNet: 28.6, leader: false, ma50Status: "warning" },
  MWG: { pattern: "Sóng Elliott tăng chủ đạo (Sóng 3)", breakout: true, volSpike: 2.0, foreignNet: 320.1, leader: true, ma50Status: "safe" },
  STB: { pattern: "Nền tích lũy lớn kiến tạo", breakout: false, volSpike: 1.1, foreignNet: -8.4, leader: false, ma50Status: "safe" },
  NLG: { pattern: "Mô hình 2 đáy bứt phá", breakout: true, volSpike: 1.5, foreignNet: 15.8, leader: false, ma50Status: "warning" },
  HPG: { pattern: "Wyckoff tích lũy kênh trên", breakout: false, volSpike: 1.2, foreignNet: -22.1, leader: false, ma50Status: "broken" },
  VCB: { pattern: "Tích lũy chặt biên độ hẹp", breakout: false, volSpike: 0.9, foreignNet: 65.3, leader: true, ma50Status: "safe" },
  SSI: { pattern: "Breakout kênh giá ngắn hạn", breakout: true, volSpike: 2.3, foreignNet: 38.7, leader: false, ma50Status: "safe" },
  KBC: { pattern: "Pullback về MA20 thành công", breakout: false, volSpike: 1.4, foreignNet: 19.2, leader: false, ma50Status: "safe" },
  VHC: { pattern: "Breakout nền giá 3 tháng", breakout: true, volSpike: 1.7, foreignNet: 22.4, leader: false, ma50Status: "safe" },
  MBB: { pattern: "Tích lũy hẹp dần VCP", breakout: false, volSpike: 1.0, foreignNet: 41.6, leader: false, ma50Status: "safe" },
};

// ============ ELITE DETAIL ENRICHMENT (entry/target/stoploss/radar) ============
export const eliteDetailMap: Record<string, EliteDetail> = {
  FPT: { entry: 132000, target: 165000, stoploss: 124000, weight: "20%", radar: { macro: 95, flow: 98, tech: 94, sentiment: 97 }, reason: "Đầu tàu AI & Bán dẫn của VN. Tốc độ tăng trưởng EPS > 20% bền vững. Khối ngoại gom ròng liên tục." },
  PVS: { entry: 42500, target: 55000, stoploss: 39800, weight: "15%", radar: { macro: 90, flow: 94, tech: 91, sentiment: 93 }, reason: "Hưởng lợi siêu dự án Lô B Ô Môn trị giá 12 tỷ USD. Xu hướng bứt phá đỉnh thời đại với vol bùng nổ." },
  TCB: { entry: 23500, target: 31000, stoploss: 21800, weight: "15%", radar: { macro: 88, flow: 87, tech: 90, sentiment: 91 }, reason: "NIM dẫn đầu ngành, Casa cao kỷ lục trở lại. Định giá P/B cực kỳ hấp dẫn so với hiệu quả sinh lời." },
  HAH: { entry: 44000, target: 58000, stoploss: 41000, weight: "10%", radar: { macro: 89, flow: 85, tech: 88, sentiment: 86 }, reason: "Giá cước tàu container thế giới tăng 150% trong 2 tháng. Đội tàu trẻ và công suất mở rộng mạnh mẽ." },
  DGC: { entry: 118000, target: 148000, stoploss: 111000, weight: "10%", radar: { macro: 84, flow: 86, tech: 85, sentiment: 85 }, reason: "Phốt pho vàng đón đầu sóng nhà máy bán dẫn hồi sinh ở Đông Á. Biên lợi nhuận gộp cực lớn." },
  GVR: { entry: 32500, target: 45000, stoploss: 30000, weight: "10%", radar: { macro: 88, flow: 82, tech: 86, sentiment: 84 }, reason: "Sở hữu quỹ đất cao su tự nhiên khổng lồ. Hưởng lợi kép từ giá cao su tăng vọt và phát triển hạ tầng KCN." },
  MWG: { entry: 61000, target: 78000, stoploss: 57000, weight: "10%", radar: { macro: 78, flow: 88, tech: 84, sentiment: 82 }, reason: "Bách Hóa Xanh đạt điểm hòa vốn và mang lại lợi nhuận ròng. Khối ngoại chuyển sang gom lớn." },
  STB: { entry: 29000, target: 38000, stoploss: 27500, weight: "5%", radar: { macro: 80, flow: 82, tech: 81, sentiment: 81 }, reason: "Xử lý xong nợ xấu VAMC, chuẩn bị đấu giá 32.5% cổ phần Trầm Bê tạo cú hích lớn về thặng dư." },
  NLG: { entry: 41500, target: 54000, stoploss: 38500, weight: "5%", radar: { macro: 75, flow: 80, tech: 83, sentiment: 82 }, reason: "Cơ cấu tài chính an toàn nhất nhóm BĐS, phân khúc nhà ở thực có thanh khoản cao." },
  HPG: { entry: 27000, target: 35000, stoploss: 25500, weight: "5%", radar: { macro: 82, flow: 75, tech: 80, sentiment: 80 }, reason: "Siêu dự án Dung Quất 2 chuẩn bị chạy thử nghiệm. Sản lượng xuất khẩu tăng trưởng mạnh." },
  VCB: { entry: 91000, target: 108000, stoploss: 86000, weight: "5%", radar: { macro: 85, flow: 83, tech: 82, sentiment: 84 }, reason: "Ngân hàng quốc doanh đầu ngành, chất lượng tài sản tốt nhất hệ thống, định giá premium hợp lý." },
  SSI: { entry: 38500, target: 49000, stoploss: 35800, weight: "5%", radar: { macro: 76, flow: 84, tech: 86, sentiment: 80 }, reason: "Hưởng lợi trực tiếp từ KRX và kỳ vọng nâng hạng thị trường, thị phần môi giới dẫn đầu." },
};

// ============ LIVE MACRO NEWS & SENTIMENT ============
export const liveMacroNewsSentiment: MacroNews[] = [
  { id: 1, headline: "Ngân hàng Nhà nước giảm lãi suất liên ngân hàng thêm 0.25%", impact: 8, affectedSectors: "Tất cả các ngành", relatedTicker: "TCB", type: "Chính sách SBV" },
  { id: 2, headline: "Thông qua gia hạn hiệu lực Luật Đất đai 2024 sớm từ tháng sau", impact: 7, affectedSectors: "Bất động sản", relatedTicker: "NLG", type: "Chính sách đất đai" },
  { id: 3, headline: "Cước tàu Drewry tiếp tục phi mã vượt mốc 5,200 USD/FEU", impact: 9, affectedSectors: "Vận tải biển", relatedTicker: "HAH", type: "Hàng hóa & Vận tải" },
  { id: 4, headline: "Giá Phốt pho vàng toàn cầu bứt tốc 4.5% nhờ nhu cầu bán dẫn", impact: 8, affectedSectors: "Hóa chất bán dẫn", relatedTicker: "DGC", type: "Hàng hóa thế giới" },
  { id: 5, headline: "Tỷ giá USD/VND chịu sức ép lớn khi DXY tăng vọt lên vùng 105.8", impact: -6, affectedSectors: "BĐS & Tài chính", relatedTicker: "VIC", type: "Tỷ giá & Liên thị trường" },
];