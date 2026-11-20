# LottoLab Global

글로벌 복권 **통계 분석 · 번호 연구소**. 한국 로또 6/45, 미국 Powerball, 일본 로토6, 유로밀리언즈의
**실제 공개 추첨 결과**를 내장하고, 빈도·오버듀·분포 분석과 번호 생성, PRO 전용 정밀 필터·백테스트를
제공하는 **정적 웹앱**입니다. 빌드 도구·서버·유료 백엔드 없이 GitHub Pages에서 그대로 동작합니다.

> ⚠️ 과거 공개 추첨 통계 참고 도구이며, 당첨을 예측하거나 보장하지 않습니다.

---

## 1. 구성

```
lottolab-global/
├── index.html                  # 단일 페이지 (헤더 / 4탭 / 모달)
├── css/styles.css              # 디자인 시스템, 반응형(1280 / 390 검증)
├── js/
│   ├── config.js               # PRO 구매 URL·라이선스 코드·무료 한도
│   ├── i18n.js                 # ko / en / ja / zh 사전 (전 키 동일)
│   ├── games.js                # 4개 복권 규칙·확률·OMR 열 수·국기 SVG
│   ├── stats.js                # 빈도·오버듀·홀짝·고저·총합 분포 엔진
│   ├── generator.js            # 가중치 샘플링 + 하드 필터 생성기
│   ├── backtest.js             # 워크포워드 백테스트
│   └── app.js                  # 렌더링·상태·이벤트
├── data/                       # 실제 회차 JSON (아래 4개)
├── scripts/fetch_draws.py      # 공개 데이터 수집·정규화 (Actions에서 실행)
├── tests/e2e.py                # Playwright E2E (81개 체크)
└── .github/workflows/update-draws.yml
```

## 2. 내장 데이터 (실제 공개 데이터만)

| 게임 | 규칙 | 회차 | 기간 | 출처 |
|---|---|---|---|---|
| 🇰🇷 로또 6/45 | 1~45 중 6 + 보너스 | 1,250 | 2002-12-07 ~ 2026-11-14 | 동행복권 `dhlottery.co.kr/lt645` 공개 결과 API |
| 🇺🇸 Powerball | 1~69 중 5 + 파워볼 1~26 | 1,724 | 2010-02-03 ~ 2026-11-18 | NY Open Data `data.ny.gov/resource/d6yy-54nr` |
| 🇯🇵 로토6 | 1~43 중 6 + 보너스 | 2,156 | 2000-10-05 ~ 2026-11-19 | kujishirube.info 공개 CSV (재배포 허용) |
| 🇪🇺 EuroMillions | 1~50 중 5 + 럭키스타 1~12 중 2 | 1,999 | 2004-02-13 ~ 2026-11-17 | mes-resultats-fdj.fr 공개 CSV |

- 각 파일의 `meta`에 `source_name / source_url / fetched_at / draw_count`가 들어 있고, UI 우측 상단
  "내장 데이터" 카드에 **출처·기간·기준일**이 그대로 표시됩니다.
- 수집 스크립트는 값 검증(번호 범위·중복·날짜 형식)을 통과한 행만 저장하며, **어떤 경우에도 회차를
  만들어 넣지 않습니다.** 소스가 실패한 실행은 기존 JSON을 그대로 두고 종료 코드 1로 끝납니다.

### 자동 갱신

`.github/workflows/update-draws.yml` — 매주 월·목·토 03:00 UTC(한국 12:00)에 실행되고,
저장소 Settings → Actions에서 수동 실행(workflow_dispatch)도 가능합니다.

```bash
python3 scripts/fetch_draws.py          # 전체 갱신
python3 scripts/fetch_draws.py kr jp    # 일부만
```

## 3. 로컬 실행

`fetch`로 JSON을 읽으므로 `file://`이 아니라 로컬 서버로 열어야 합니다.

```bash
cd lottolab-global
python3 -m http.server 8000
# http://localhost:8000
```

## 4. GitHub Pages 배포

```bash
git init && git add . && git commit -m "feat: LottoLab Global v1.0"
git branch -M main
git remote add origin https://github.com/<user>/lottolab-global.git
git push -u origin main
```

저장소 → Settings → Pages → Source: `Deploy from a branch`, Branch: `main` / `/ (root)`.
`data/*.json`, `js/*.js` 모두 상대 경로라 `https://<user>.github.io/lottolab-global/` 에서 바로 동작합니다.

## 5. 무료 / PRO

| 구분 | 내용 |
|---|---|
| 무료 | 통계 차트 전체, 번호 추천 **1일 1회 · 2게임**, OMR 슬립 미리보기 |
| PRO | 정밀 필터(핫/콜드 가중치, 홀짝, 총합, 연속수, 고정수/제외수), 과거 전체 백테스트, 10게임 일괄 + CSV |

잠긴 기능을 누르면 업그레이드 모달이 열리고, 래피드 구매 링크 + 라이선스 코드 입력 + 체험 코드
`LOTTOLAB-TRIAL-2026`(7일)를 제공합니다.

### 설정 (`js/config.js`)

```js
PRO_BUY_URL: "https://latpeed.com/",   // ← 실제 래피드 상품 URL로 교체
LICENSES: [ { code: "LOTTOLAB-TRIAL-2026", plan: "trial", days: 7 }, ... ]
FREE_GENERATIONS_PER_DAY: 1,
FREE_GAMES_PER_GENERATION: 2,
```

> **중요:** 정적 사이트라 라이선스 검증이 브라우저에서 이뤄집니다. 코드를 아는 사람은 누구나 쓸 수 있고,
> 콘솔로 우회도 가능합니다. 실제 판매 규모가 생기면 ① 래피드/검증 서버에서 코드 확인 후 서명 토큰 발급,
> ② Cloudflare Worker 같은 소형 검증 엔드포인트, ③ Gumroad/Lemon Squeezy 라이선스 API 연동 중 하나로
> 교체하세요. `activateCode()` 한 곳만 바꾸면 됩니다.

## 6. 백테스트 방식

- 내장된 회차를 **시간순으로 재생**하며, 각 회차 시점에 **그 이전 회차까지의 빈도**로만 가중치를 계산합니다
  (워크포워드). 테스트 대상 회차의 결과가 가중치에 새어 들어가지 않습니다.
- 회차마다 현재 필터로 N게임을 생성(시드 고정 RNG)하고 실제 당첨번호와 일치 개수를 집계합니다.
- "이론 확률"은 초기하분포 `Σ_{k≥3} C(pick,k)·C(max−pick, pick−k) / C(max,pick)` 로 계산한 값입니다.
- 필터는 확률을 바꾸지 않습니다. 백테스트 수치는 참고용이며 미래를 보장하지 않습니다.

## 7. 테스트

```bash
pip install playwright && playwright install chromium
python3 tests/e2e.py
```

검증 항목(총 81개): 4개 국가/복권 전환, 4개 국어 번역 누락 0건(사전 키·DOM 바인딩 모두), 무료 한도 →
PRO 코드 해금 → 필터 조합 생성(고정수·제외수·홀짝·총합·연속수 실제 검증) → 백테스트, CSV 다운로드,
데스크톱 1280px·모바일 390px 가로 오버플로 0, 콘솔/페이지 에러 0.

스크린샷은 `../browser/lottolab-{desktop,mobile,pro}.png`로 저장됩니다(`--headful`로 눈으로 확인 가능).

## 8. 법적 고지

본 서비스는 복권의 구매·판매·중개를 하지 않으며 각 복권 운영 기관과 무관한 독립 통계 도구입니다.
모든 화면에 면책 문구가 고정 표시됩니다. 만 19세 미만은 이용할 수 없습니다.
