#!/usr/bin/env python3
"""
LottoLab Global — end-to-end checks (Playwright / Chromium).

Covers the acceptance list from the product brief:
  * 4 countries / lotteries switch rules, language and real draw data
  * 4 languages with zero missing translations
  * free tier limit -> PRO unlock -> filter combinations -> backtest
  * no horizontal overflow at 1280px and 390px
  * zero console errors / page errors
  * screenshots for review

Run:
    python3 tests/e2e.py                  # starts its own static server
    python3 tests/e2e.py --base-url http://localhost:8000
"""
from __future__ import annotations

import argparse
import functools
import http.server
import os
import socketserver
import sys
import threading
import time
import traceback

from playwright.sync_api import sync_playwright

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SHOT_DIR = os.path.abspath(os.path.join(ROOT, "..", "browser"))

GAMES = [
    # id, expected title, expected stats bars, language after switch
    ("kr", "로또 6/45", 45, "ko"),
    ("us", "Powerball", 69, "en"),
    ("jp", "ロト6", 43, "ja"),
    ("eu", "EuroMillions", 50, "en"),
]
LANGS = ["ko", "en", "ja", "zh"]

results: list[tuple[str, bool, str]] = []


def check(name: str, cond: bool, detail: str = "") -> None:
    results.append((name, bool(cond), detail))
    mark = "PASS" if cond else "FAIL"
    print(f"  [{mark}] {name}" + (f" — {detail}" if detail and not cond else ""))


def serve(directory: str):
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=directory)
    httpd = socketserver.TCPServer(("127.0.0.1", 0), handler)
    port = httpd.server_address[1]
    t = threading.Thread(target=httpd.serve_forever, daemon=True)
    t.start()
    return httpd, f"http://127.0.0.1:{port}/index.html"


def wait_data(page) -> None:
    page.wait_for_function(
        "() => { const el = document.querySelector('#kpiDraws'); return el && /[0-9]/.test(el.textContent); }",
        timeout=15000,
    )


def freeze(page) -> None:
    """Stop the fade-in animation so screenshots capture the settled UI."""
    page.add_style_tag(content="*{animation:none !important;transition:none !important}")


def visible_overflow(page) -> list:
    return page.evaluate(
        "() => [document.documentElement.scrollWidth, document.documentElement.clientWidth, document.body.scrollWidth]"
    )


def collect_i18n(page) -> dict:
    return page.evaluate(
        """() => {
            const out = {};
            document.querySelectorAll('[data-i18n]').forEach((el) => {
                out[el.getAttribute('data-i18n')] = (el.textContent || '').trim();
            });
            return out;
        }"""
    )


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--base-url", default=None)
    ap.add_argument("--headful", action="store_true")
    args = ap.parse_args()

    httpd = None
    base = args.base_url
    if not base:
        httpd, base = serve(ROOT)
        print(f"serving {ROOT} at {base}")

    os.makedirs(SHOT_DIR, exist_ok=True)
    errors: list[str] = []

    with sync_playwright() as pw:
        browser = pw.chromium.launch(headless=not args.headful)

        # ── desktop ────────────────────────────────────────────────
        print("\n== desktop 1280x1000 ==")
        ctx = browser.new_context(viewport={"width": 1280, "height": 1000})
        page = ctx.new_page()
        page.on("console", lambda m: errors.append(f"console.{m.type}: {m.text}") if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(f"pageerror: {e}"))
        page.goto(base)
        wait_data(page)

        # dictionary parity (all four languages share the same keys)
        parity = page.evaluate(
            """() => {
                const langs = Object.keys(window.I18N);
                const base = Object.keys(window.I18N.ko).sort();
                const out = { langs, missing: {}, used: {} };
                langs.forEach((l) => {
                    const keys = Object.keys(window.I18N[l]);
                    out.missing[l] = base.filter((k) => !(k in window.I18N[l]))
                        .concat(keys.filter((k) => !base.includes(k)));
                    out.used[l] = keys.filter((k) => !String(window.I18N[l][k] || '').trim());
                });
                return out;
            }"""
        )
        check("i18n: 4 dictionaries loaded", len(parity["langs"]) == 4, str(parity["langs"]))
        for lang in parity["langs"]:
            check(f"i18n[{lang}]: key set matches ko", not parity["missing"][lang], str(parity["missing"][lang])[:200])
            check(f"i18n[{lang}]: no empty values", not parity["used"][lang], str(parity["used"][lang])[:200])

        # speak all four languages and verify every bound label
        for lang in LANGS:
            page.select_option("#langSelect", lang)
            page.wait_for_timeout(250)
            labels = collect_i18n(page)
            raw = [k for k, v in labels.items() if not v or v == k or v.startswith(k + ".")]
            latin = [k for k, v in labels.items() if v and v.count(".") and v.replace(".", "").isascii() and v == k]
            check(f"lang {lang}: {len(labels)} labels present", len(labels) > 60, str(len(labels)))
            check(f"lang {lang}: no raw i18n keys in DOM", not raw and not latin, f"{raw[:4]} {latin[:4]}")
            disc = page.inner_text(".footer-disclaimer")
            check(f"lang {lang}: disclaimer visible", len(disc) > 15, disc[:40])
        page.select_option("#langSelect", "ko")
        page.wait_for_timeout(200)

        # country / lottery switching
        for gid, title, bars, lang in GAMES:
            page.evaluate("localStorage.clear()")
            page.reload()
            wait_data(page)
            page.click(f"[data-game-switch='{gid}']")
            page.wait_for_timeout(1200)
            info = page.evaluate(
                """() => ({
                    title: document.querySelector('#heroTitle').textContent.trim(),
                    rule: document.querySelector('#heroRule').textContent.trim(),
                    range: document.querySelector('#dataRange').textContent.trim(),
                    period: document.querySelector('#dataPeriod').textContent.trim(),
                    odds: document.querySelector('#heroOdds').textContent.trim(),
                    bars: document.querySelectorAll('#freqChart rect.bar-rect').length,
                    lang: document.body.dataset.lang,
                    extra: document.querySelector('#colExtra').textContent.trim(),
                    recent: document.querySelectorAll('#recentBody tr').length,
                    over: document.documentElement.scrollWidth > document.documentElement.clientWidth,
                })"""
            )
            check(f"{gid}: title '{info['title']}'", info["title"] == title, info["title"])
            check(f"{gid}: rule translated", len(info["rule"]) > 4, info["rule"])
            digits = "".join(ch for ch in info["range"] if ch.isdigit())
            check(f"{gid}: real draw data loaded", digits.isdigit() and int(digits) >= 100 and "–" in info["period"],
                  f"{info['range']} / {info['period']}")
            check(f"{gid}: language auto-switch {info['lang']}", info["lang"] == lang, info["lang"])
            check(f"{gid}: frequency chart {info['bars']} bars", info["bars"] == bars, str(info["bars"]))
            check(f"{gid}: recent draws table filled", info["recent"] == 10, str(info["recent"]))
            check(f"{gid}: odds shown", info["odds"].startswith("1 /"), info["odds"])
            check(f"{gid}: no horizontal overflow", not info["over"], str(info["over"]))

        # back to Korea for the flow tests
        page.evaluate("localStorage.clear()")
        page.reload()
        wait_data(page)
        page.wait_for_timeout(700)  # let the panel fade-in finish before the shot
        page.evaluate("window.scrollTo(0,0)")
        freeze(page)
        page.wait_for_timeout(120)
        page.screenshot(path=os.path.join(SHOT_DIR, "lottolab-desktop.png"))

        # ── free tier ──────────────────────────────────────────────
        print("\n== free tier ==")
        page.click("[data-tab='generate']")
        page.wait_for_timeout(250)
        check("free: counter shows today's allowance", "/" in page.inner_text("#freeLeft"), page.inner_text("#freeLeft"))
        page.click("#btnFreeGenerate")
        page.wait_for_timeout(600)
        cards = page.eval_on_selector_all("#gameCards .game-card", "els => els.length")
        check("free: 2 games generated", cards == 2, str(cards))
        check("free: OMR slip rendered", page.is_visible("#omrWrap .omr-slip"))
        cells = page.eval_on_selector_all("#omrWrap .omr-cell.is-marked", "els => els.length")
        check("free: 12 marked cells (2x6)", cells >= 12, str(cells))
        page.click("#btnFreeGenerate")
        page.wait_for_timeout(400)
        check("free: second try opens upgrade modal", page.is_visible("#proModal"))
        page.click(".modal-close")
        page.wait_for_timeout(200)

        # ── license gate ───────────────────────────────────────────
        print("\n== pro unlock ==")
        page.click("[data-tab='pro']")
        page.wait_for_timeout(250)
        check("gate: pro panel locked", page.is_visible("#proGate"))
        page.click("#proGate button[data-open-modal]")
        page.wait_for_timeout(300)
        page.fill("#codeInput", "WRONG-CODE")
        page.click("#codeForm button[type=submit]")
        page.wait_for_timeout(200)
        check("gate: wrong code rejected", page.is_visible("#codeError"))
        page.fill("#codeInput", "LOTTOLAB-TRIAL-2026")
        page.click("#codeForm button[type=submit]")
        page.wait_for_timeout(400)
        check("gate: trial code accepted", page.evaluate("document.body.classList.contains('is-pro')"))
        check("gate: modal closed", not page.is_visible("#proModal"))
        check("gate: overlay hidden", not page.is_visible("#proGate"))

        # ── filters -> generation ──────────────────────────────────
        print("\n== pro filters ==")
        page.select_option("#oddEven", "3:3")
        page.fill("#sumMin", "110")
        page.fill("#sumMax", "160")
        page.click(".pick-num[data-pick='fixed'][data-n='7']")
        page.click(".pick-num[data-pick='excluded'][data-n='13']")
        page.select_option("#proGameCount", "10")
        page.click("#btnProGenerate")
        page.wait_for_timeout(700)
        games = page.evaluate(
            "() => Array.from(document.querySelectorAll('#proGameCards .game-card')).map(c => "
            "Array.from(c.querySelectorAll('.ball-row .ball')).map(b => +b.textContent))"
        )
        check("filters: 10 games generated", len(games) == 10, str(len(games)))
        bad = [
            g for g in games
            if 7 not in g or 13 in g or sum(1 for n in g if n % 2) != 3
            or not (110 <= sum(g) <= 160) or len(set(g)) != 6
            or any(b - a == 1 for a, b in zip(sorted(g), sorted(g)[1:]))
        ]
        check("filters: fixed/excluded/odd/sum/consecutive honoured", not bad, str(bad[:2]))
        check("filters: OMR slips for 10 games", page.eval_on_selector_all("#proOmr .omr-game", "e => e.length") == 10)
        summary = page.inner_text("#filterSummary")
        check("filters: summary shows conditions", "3 : 3" in summary and "10" in summary, summary)

        # CSV download
        try:
            with page.expect_download(timeout=5000) as dl:
                page.click("#btnCsvPro")
            name = dl.value.suggested_filename
            check("csv: download offered", name.startswith("lottolab-kr-") and name.endswith(".csv"), name)
        except Exception as exc:  # noqa: BLE001
            check("csv: download offered", False, str(exc))

        freeze(page)
        # clean feature shot: no toast, no sticky chrome over the results
        page.eval_on_selector("#toast", "e => { e.hidden = true; }")
        page.add_style_tag(
            content=".topbar,.disclaimer-bar{visibility:hidden !important}"
            "#panel-pro .pro-actions{visibility:hidden !important}"
        )
        page.eval_on_selector("#proResultCard", "e => { e.style.scrollMarginTop = '18px'; e.scrollIntoView({block:'start'}); }")
        page.wait_for_timeout(800)
        page.screenshot(path=os.path.join(SHOT_DIR, "lottolab-pro.png"))

        # ── backtest ───────────────────────────────────────────────
        print("\n== backtest ==")
        page.click("[data-tab='backtest']")
        page.wait_for_timeout(250)
        page.select_option("#btScope", "all")
        page.select_option("#btGames", "5")
        page.click("#btnBacktest")
        page.wait_for_timeout(3500)
        bt = page.evaluate(
            """() => ({
                games: document.querySelector('#btGamesCount').textContent,
                hit: document.querySelector('#btHitRate').textContent,
                base: document.querySelector('#btBaseline').textContent,
                rows: document.querySelectorAll('#btDist .dist-row').length,
                label: document.querySelector('#btScopeLabel').textContent,
            })"""
        )
        check("backtest: games counted", bt["games"].replace(",", "").isdigit() and int(bt["games"].replace(",", "")) > 1000, bt["games"])
        check("backtest: hit rate computed", bt["hit"].endswith("%"), bt["hit"])
        check("backtest: baseline shown", bt["base"].endswith("%"), bt["base"])
        check("backtest: 7 distribution rows (0-6)", bt["rows"] == 7, str(bt["rows"]))
        check("backtest: scope label", "-" in bt["label"] or "–" in bt["label"], bt["label"])

        # expired trial must re-lock the PRO panels
        page.evaluate(
            """() => {
                const key = 'lottolab.license.v1';
                const lic = JSON.parse(localStorage.getItem(key));
                lic.until = '2020-01-01';
                localStorage.setItem(key, JSON.stringify(lic));
            }"""
        )
        page.reload()
        wait_data(page)
        page.wait_for_timeout(400)
        check("license: expired trial re-locks", not page.evaluate("document.body.classList.contains('is-pro')"))
        page.click("[data-tab='pro']")
        page.wait_for_timeout(300)
        check("license: gate returns after expiry", page.is_visible("#proGate"))

        # layout at desktop
        ow = visible_overflow(page)
        check("desktop: no horizontal overflow", ow[0] <= ow[1], f"{ow}")

        ctx.close()

        # ── mobile ─────────────────────────────────────────────────
        print("\n== mobile 390x844 ==")
        mctx = browser.new_context(
            viewport={"width": 390, "height": 844},
            device_scale_factor=2,
            is_mobile=True,
            has_touch=True,
        )
        mpage = mctx.new_page()
        mpage.on("console", lambda m: errors.append(f"mobile console.{m.type}: {m.text}") if m.type == "error" else None)
        mpage.on("pageerror", lambda e: errors.append(f"mobile pageerror: {e}"))
        mpage.goto(base)
        wait_data(mpage)
        for tab in ["stats", "generate", "pro", "backtest"]:
            mpage.click(f"[data-tab='{tab}']")
            mpage.wait_for_timeout(300)
            ow = visible_overflow(mpage)
            check(f"mobile[{tab}]: no horizontal overflow", ow[0] <= ow[1], f"{ow}")
        mpage.click("[data-tab='generate']")
        mpage.wait_for_timeout(200)
        mpage.click("#btnFreeGenerate")
        mpage.wait_for_timeout(600)
        mpage.click("[data-tab='stats']")
        mpage.wait_for_timeout(300)
        ow = visible_overflow(mpage)
        check("mobile: no overflow after games + slip", ow[0] <= ow[1], f"{ow}")
        mpage.evaluate("window.scrollTo(0,0)")
        freeze(mpage)
        mpage.wait_for_timeout(200)
        mpage.screenshot(path=os.path.join(SHOT_DIR, "lottolab-mobile.png"))
        # country switch still reachable on mobile
        mpage.click("[data-game-switch='jp']")
        mpage.wait_for_timeout(1200)
        title = mpage.inner_text("#heroTitle")
        check("mobile: country switch works", title == "ロト6", title)
        ow = visible_overflow(mpage)
        check("mobile[jp]: no horizontal overflow", ow[0] <= ow[1], f"{ow}")
        mctx.close()
        browser.close()

    check("console/page errors: none", not errors, " | ".join(errors[:4]))

    passed = sum(1 for _, ok, _ in results if ok)
    failed = [(n, d) for n, ok, d in results if not ok]
    print(f"\n{passed}/{len(results)} checks passed")
    if failed:
        for name, detail in failed:
            print(f"  FAILED: {name} — {detail}")
    if httpd:
        httpd.shutdown()
    return 0 if not failed else 1


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:  # noqa: BLE001
        traceback.print_exc()
        sys.exit(2)
