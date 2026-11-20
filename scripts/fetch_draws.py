#!/usr/bin/env python3
"""
LottoLab Global - draw data fetcher / normalizer.

Pulls real, publicly published draw results for the four supported games and
writes normalised JSON into ../data/ :

    kr645.json          Lotto 6/45        (Republic of Korea, dhlottery.co.kr)
    us-powerball.json   Powerball         (Multi-state USA, NY Open Data)
    jp-loto6.json       Loto 6            (Japan, kujishirube.info public CSV)
    eu-euromillions.json EuroMillions     (Europe, mes-resultats-fdj.fr public CSV)

Every record written here comes from a live HTTP response. Nothing is generated
or filled in: a source that is unavailable on a run leaves the previous file
untouched and is reported, so the site never shows invented draws.

Usage:
    python3 scripts/fetch_draws.py            # update all games
    python3 scripts/fetch_draws.py kr jp      # update selected games
"""

from __future__ import annotations

import csv
import io
import json
import os
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from datetime import datetime, timezone

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DATA_DIR = os.path.join(ROOT, "data")
UA = (
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 "
    "(KHTML, like Gecko) Chrome/126.0 Safari/537.36"
)
TIMEOUT = 45


# --------------------------------------------------------------------------- #
# helpers
# --------------------------------------------------------------------------- #
def http_get(url: str, headers: dict | None = None) -> bytes:
    req = urllib.request.Request(url, headers={"User-Agent": UA, **(headers or {})})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
                return resp.read()
        except (urllib.error.URLError, TimeoutError) as exc:  # noqa: PERF203
            if attempt == 2:
                raise RuntimeError(f"GET failed: {url} ({exc})") from exc
            time.sleep(2 + attempt * 2)
    raise RuntimeError("unreachable")


def http_get_json(url: str) -> dict | list:
    raw = http_get(url, {"Accept": "application/json"})
    return json.loads(raw.decode("utf-8"))


def validate(draws: list[dict], main_max: int, pick: int, extra_max: int, extra_count: int) -> list[dict]:
    """Reject anything that is structurally impossible before it reaches the site."""
    clean: list[dict] = []
    seen: set[str] = set()
    for d in draws:
        main = d["main"]
        extra = d["extra"]
        if len(main) != pick or len(set(main)) != pick:
            continue
        if any(not (1 <= n <= main_max) for n in main):
            continue
        if len(extra) != extra_count or any(not (1 <= n <= extra_max) for n in extra):
            continue
        if extra_count > 1 and len(set(extra)) != extra_count:
            continue
        if extra_count == 1 and extra and extra[0] in main:
            continue
        try:
            datetime.strptime(d["date"], "%Y-%m-%d")
        except Exception:
            continue
        flag = d["date"]
        if flag in seen:
            continue
        seen.add(flag)
        clean.append(
            {
                "draw": d["draw"],
                "date": d["date"],
                "main": sorted(main),
                "extra": sorted(extra) if extra_count > 1 else extra,
            }
        )
    clean.sort(key=lambda x: x["date"])
    return clean


def write_game(slug: str, payload: dict) -> None:
    os.makedirs(DATA_DIR, exist_ok=True)
    path = os.path.join(DATA_DIR, f"{slug}.json")
    payload["meta"]["fetched_at"] = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
    payload["meta"]["draw_count"] = len(payload["draws"])
    payload["meta"]["first_draw"] = payload["draws"][0] if payload["draws"] else None
    payload["meta"]["last_draw"] = payload["draws"][-1] if payload["draws"] else None
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, ensure_ascii=False, separators=(",", ":"))
    os.replace(tmp, path)
    print(
        f"  wrote {slug}.json  draws={len(payload['draws'])}  "
        f"last={payload['meta']['last_draw']['date'] if payload['draws'] else '-'}  "
        f"({os.path.getsize(path)/1024:.1f} KB)"
    )


# --------------------------------------------------------------------------- #
# Korea - Lotto 6/45
# --------------------------------------------------------------------------- #
def fetch_kr() -> dict:
    """dhlottery.co.kr public result endpoint (JSON, no key).

    `srchLtEpsd=all` returns every published round; the per-round endpoint
    returns 10 rounds around the requested one and is used as a fallback for
    the most recent rounds only.
    """
    base = "https://www.dhlottery.co.kr/lt645"
    url = f"{base}/selectPstLt645Info.do?srchLtEpsd=all&_={int(time.time()*1000)}"
    rows: list[dict] = []
    try:
        data = http_get_json(url)
        rows = (data.get("data") or {}).get("list") or []
    except Exception as exc:  # noqa: BLE001
        print(f"  kr: 'all' endpoint failed ({exc}); falling back to latest + centre")
        latest = http_get_json(f"{base}/selectPstLt645Info.do?_={int(time.time()*1000)}")
        latest_no = (latest["data"]["list"][0])["ltEpsd"]
        for centre in range(max(1, latest_no - 100), latest_no + 1, 10):
            chunk = http_get_json(
                f"{base}/selectPstLt645InfoNew.do?srchDir=center&srchLtEpsd={centre}"
            )
            rows.extend((chunk.get("data") or {}).get("list") or [])
            time.sleep(0.6)

    draws = []
    for r in rows:
        if not r.get("ltEpsd") or not r.get("tm1WnNo"):
            continue
        ymd = str(r.get("ltRflYmd") or "")
        if len(ymd) != 8:
            continue
        draws.append(
            {
                "draw": int(r["ltEpsd"]),
                "date": f"{ymd[0:4]}-{ymd[4:6]}-{ymd[6:8]}",
                "main": [int(r[f"tm{i}WnNo"]) for i in range(1, 7)],
                "extra": [int(r["bnsWnNo"])] if r.get("bnsWnNo") else [],
            }
        )
    draws = validate(draws, 45, 6, 45, 1)
    return {
        "game": "kr645",
        "meta": {
            "title": "로또 6/45",
            "country": "KR",
            "main_max": 45,
            "pick": 6,
            "extra_max": 45,
            "extra_count": 1,
            "extra_label": "bonus",
            "source_name": "동행복권 (dhlottery.co.kr) 공개 회차 결과",
            "source_url": "https://www.dhlottery.co.kr/lt645/result",
            "source_endpoint": url.split("&_=")[0],
            "license": "공개 추첨 결과 (통계 참고용)",
        },
        "draws": draws,
    }


# --------------------------------------------------------------------------- #
# USA - Powerball
# --------------------------------------------------------------------------- #
def fetch_us() -> dict:
    """NY Open Data 'Lottery Powerball Winning Numbers' (public, no key)."""
    url = (
        "https://data.ny.gov/resource/d6yy-54nr.json"
        "?$limit=5000&$order=draw_date%20ASC"
    )
    rows = http_get_json(url)
    draws = []
    for r in rows:
        nums = [int(x) for x in str(r.get("winning_numbers", "")).split() if x.strip()]
        if len(nums) != 6:
            continue
        draws.append(
            {
                "draw": str(r.get("draw_date", ""))[:10].replace("-", ""),
                "date": str(r.get("draw_date", ""))[:10],
                "main": nums[:5],
                "extra": [nums[5]],  # Powerball 1-26
            }
        )
    draws = validate(draws, 69, 5, 26, 1)
    # NY Open Data starts at 2010-02-03. Keep draw numbers readable per date.
    for d in draws:
        d["draw"] = d["date"]
    return {
        "game": "us-powerball",
        "meta": {
            "title": "Powerball",
            "country": "US",
            "main_max": 69,
            "pick": 5,
            "extra_max": 26,
            "extra_count": 1,
            "extra_label": "powerball",
            "source_name": "NY Open Data · Lottery Powerball Winning Numbers",
            "source_url": "https://data.ny.gov/resource/d6yy-54nr.json",
            "source_endpoint": "https://data.ny.gov/resource/d6yy-54nr.json",
            "license": "Public domain (data.ny.gov)",
        },
        "draws": draws,
    }


# --------------------------------------------------------------------------- #
# Japan - Loto 6
# --------------------------------------------------------------------------- #
def fetch_jp() -> dict:
    """Public CSV of every Loto 6 draw (kujishirube.info, redistribution allowed)."""
    url = "https://kujishirube.info/loto6/csv/loto6-all.csv"
    raw = http_get(url).decode("utf-8-sig")
    reader = csv.reader(io.StringIO(raw))
    next(reader, None)  # header
    draws = []
    for row in reader:
        if len(row) < 9:
            continue
        try:
            draws.append(
                {
                    "draw": int(row[0]),
                    "date": row[1],
                    "main": [int(row[i]) for i in range(2, 8)],
                    "extra": [int(row[8])],
                }
            )
        except ValueError:
            continue
    draws = validate(draws, 43, 6, 43, 1)
    return {
        "game": "jp-loto6",
        "meta": {
            "title": "ロト6 / Loto 6",
            "country": "JP",
            "main_max": 43,
            "pick": 6,
            "extra_max": 43,
            "extra_count": 1,
            "extra_label": "bonus",
            "source_name": "kujishirube.info 공개 회차 CSV (제1회~최신, 재배포 허용)",
            "source_url": "https://kujishirube.info/loto6/csv/",
            "source_endpoint": url,
            "license": "무료 재배포 허용 (kujishirube.info 이용조건)",
        },
        "draws": draws,
    }


# --------------------------------------------------------------------------- #
# Europe - EuroMillions
# --------------------------------------------------------------------------- #
def fetch_eu() -> dict:
    """FDJ result history CSV (date;draw;b1..b5;star1;star2), newest first."""
    url = "https://www.mes-resultats-fdj.fr/api/telecharger/euromillions"
    raw = http_get(url).decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(raw), delimiter=";")
    draws = []
    for row in reader:
        try:
            d, m, y = row["date"].split("/")
            draws.append(
                {
                    "draw": str(row.get("numero_tirage", "")).strip(),
                    "date": f"{y}-{m}-{d}",
                    "main": [int(row[f"boule_{i}"]) for i in range(1, 6)],
                    "extra": [int(row["etoile_1"]), int(row["etoile_2"])],
                }
            )
        except (KeyError, ValueError):
            continue
    draws = validate(draws, 50, 5, 12, 2)
    return {
        "game": "eu-euromillions",
        "meta": {
            "title": "EuroMillions",
            "country": "EU",
            "main_max": 50,
            "pick": 5,
            "extra_max": 12,
            "extra_count": 2,
            "extra_label": "luckystar",
            "source_name": "mes-resultats-fdj.fr 공개 회차 CSV (FDJ 공개 데이터 기반)",
            "source_url": "https://www.mes-resultats-fdj.fr/historique/euromillions",
            "source_endpoint": url,
            "license": "공개 추첨 결과 (통계 참고용)",
        },
        "draws": draws,
    }


FETCHERS = {
    "kr": ("kr645", fetch_kr),
    "us": ("us-powerball", fetch_us),
    "jp": ("jp-loto6", fetch_jp),
    "eu": ("eu-euromillions", fetch_eu),
}


def main(argv: list[str]) -> int:
    wanted = [a.lower() for a in argv if a.lower() in FETCHERS] or list(FETCHERS)
    failures = []
    for key in wanted:
        slug, fn = FETCHERS[key]
        print(f"[{key}] {slug}")
        try:
            payload = fn()
            if not payload["draws"]:
                raise RuntimeError("no draw rows parsed")
            write_game(slug, payload)
        except Exception as exc:  # noqa: BLE001
            print(f"  !! {slug}: {exc}")
            failures.append(f"{slug}: {exc}")
    if failures:
        print("\nFAILED (existing data kept):\n  " + "\n  ".join(failures))
        return 1
    print("\nAll games updated.")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
