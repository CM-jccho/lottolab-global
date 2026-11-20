/* ============================================================
   LottoLab Global — configuration
   Everything a site owner may want to change lives here.
   ============================================================ */
window.CONFIG = {
  VERSION: "1.0.0",

  /* PRO 결제 링크: 래피드(Latpeed) 상품 URL을 넣으면 모달의 구매 버튼에 연결됩니다.
     실제 상품을 만들기 전에는 래피드 스토어 홈으로 연결됩니다. */
  PRO_BUY_URL: "https://latpeed.com/",
  PRO_BUY_URL_IS_PLACEHOLDER: true,

  /* 라이선스 코드 — 정적 사이트라 클라이언트에서 검증합니다.
     실제 판매에서는 서버 검증(예: Gumroad/Latpeed API, Cloudflare Worker)으로 교체하세요.
     형식: LOTTOLAB-PRO-XXXX-XXXX 처럼 바꾸려면 LICENSES 배열만 수정하면 됩니다. */
  LICENSES: [
    { code: "LOTTOLAB-TRIAL-2026", plan: "trial", days: 7, label: "7-day trial" },
    { code: "LOTTOLAB-PRO-2026", plan: "pro", days: null, label: "PRO 2026" },
    { code: "LOTTOLAB-LIFETIME", plan: "pro", days: null, label: "Lifetime" }
  ],

  /* 무료 체험: 하루 1회, 2게임 */
  FREE_GENERATIONS_PER_DAY: 1,
  FREE_GAMES_PER_GENERATION: 2,

  /* PRO 생성 한도 */
  PRO_MAX_GAMES: 10,

  STORAGE: {
    license: "lottolab.license.v1",
    freeUse: "lottolab.freeUse.v1",
    prefs: "lottolab.prefs.v1"
  }
};
