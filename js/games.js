/* ============================================================
   LottoLab Global — game definitions & shared helpers
   ============================================================ */
(function () {
  const GAMES = {
    kr: {
      id: "kr",
      flag: "🇰🇷",
      lang: "ko",
      dataUrl: "data/kr645.json",
      pick: 6,
      mainMax: 45,
      extraCount: 1,
      extraMax: 45,
      extraType: "bonus",
      drawDays: [6],
      price: { ko: "1,000원", en: "₩1,000", ja: "1,000ウォン", zh: "1,000 韩元" },
      slipCols: 9,
      secondary: "1,000원"
    },
    us: {
      id: "us",
      flag: "🇺🇸",
      lang: "en",
      dataUrl: "data/us-powerball.json",
      pick: 5,
      mainMax: 69,
      extraCount: 1,
      extraMax: 26,
      extraType: "powerball",
      drawDays: [1, 3, 6],
      price: { ko: "$2", en: "$2", ja: "$2", zh: "$2" },
      slipCols: 10,
      secondary: "$2"
    },
    jp: {
      id: "jp",
      flag: "🇯🇵",
      lang: "ja",
      dataUrl: "data/jp-loto6.json",
      pick: 6,
      mainMax: 43,
      extraCount: 1,
      extraMax: 43,
      extraType: "bonus",
      drawDays: [1, 4],
      price: { ko: "200엔", en: "¥200", ja: "200円", zh: "200 日元" },
      slipCols: 8,
      secondary: "200円"
    },
    eu: {
      id: "eu",
      flag: "🇪🇺",
      lang: "en",
      dataUrl: "data/eu-euromillions.json",
      pick: 5,
      mainMax: 50,
      extraCount: 2,
      extraMax: 12,
      extraType: "luckystar",
      drawDays: [2, 5],
      price: { ko: "€2.50", en: "€2.50", ja: "€2.50", zh: "€2.50" },
      slipCols: 10,
      secondary: "€2.50"
    }
  };

  const LANG_TAG = { ko: "ko-KR", en: "en-US", ja: "ja-JP", zh: "zh-CN" };

  function combinations(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  const LL = {
    GAMES,
    LANG_TAG,

    game(id) {
      return GAMES[id] || GAMES.kr;
    },

    /* 1등 확률 = C(mainMax, pick) × extraMax^extraCount
       (보너스 볼은 2등 조건이므로 1등 확률에 곱하지 않는다) */
    odds(game) {
      const base = combinations(game.mainMax, game.pick);
      const extra = game.extraType === "bonus" ? 1 : combinations(game.extraMax, game.extraCount);
      return base * extra;
    },

    /* Small inline flag — drawn, not emoji, so it renders identically everywhere. */
    flagSVG(id) {
      const open = '<svg class="flag-svg" viewBox="0 0 24 16" aria-hidden="true" focusable="false">';
      const close = "</svg>";
      if (id === "kr") {
        // taegeuk only — the trigrams turn to noise at 19px
        return open +
          '<rect width="24" height="16" fill="#fff"/>' +
          '<path d="M6.6 8a5.4 5.4 0 0 1 10.8 0z" fill="#cd2e3a"/>' +
          '<path d="M6.6 8a5.4 5.4 0 0 0 10.8 0z" fill="#0047a0"/>' +
          '<path d="M6.6 8a2.7 2.7 0 0 1 5.4 0 2.7 2.7 0 0 0 5.4 0z" fill="#0047a0" opacity=".95"/>' +
          '<path d="M6.6 8a2.7 2.7 0 0 0 5.4 0 2.7 2.7 0 0 1 5.4 0z" fill="#cd2e3a"/>' +
          close;
      }
      if (id === "us") {
        let stripes = "";
        for (let i = 0; i < 7; i++) stripes += '<rect y="' + (i * 2.286).toFixed(2) + '" width="24" height="1.14" fill="#b22234"/>';
        return open + '<rect width="24" height="16" fill="#fff"/>' + stripes +
          '<rect width="10" height="8.6" fill="#3c3b6e"/>' +
          '<g fill="#fff"><circle cx="3" cy="2.2" r="0.65"/><circle cx="6.2" cy="2.2" r="0.65"/><circle cx="4.6" cy="4.3" r="0.65"/><circle cx="7.6" cy="4.3" r="0.65"/><circle cx="3" cy="6.4" r="0.65"/><circle cx="6.2" cy="6.4" r="0.65"/></g>' +
          close;
      }
      if (id === "jp") {
        return open + '<rect width="24" height="16" fill="#fff"/>' +
          '<circle cx="12" cy="8" r="4.4" fill="#bc002d"/>' + close;
      }
      // EU
      let stars = "";
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = (12 + Math.cos(a) * 5.1).toFixed(2);
        const y = (8 + Math.sin(a) * 5.1 * 0.72).toFixed(2);
        stars += '<circle cx="' + x + '" cy="' + y + '" r="0.78" fill="#ffcc00"/>';
      }
      return open + '<rect width="24" height="16" fill="#003399"/>' + stars + close;
    },

    /* main-number ball tone (colour family), per game convention */
    tone(game, n) {
      if (game.id === "us" || game.id === "eu") return "w";
      if (game.id === "kr") {
        if (n <= 10) return "y";
        if (n <= 20) return "b";
        if (n <= 30) return "r";
        if (n <= 40) return "n";
        return "g";
      }
      // jp loto6
      if (n <= 9) return "b";
      if (n <= 19) return "r";
      if (n <= 29) return "g";
      if (n <= 39) return "y";
      return "n";
    },

    extraTone(game) {
      if (game.extraType === "powerball") return "pb";
      if (game.extraType === "luckystar") return "star";
      return "n";
    },

    fmtInt(n, lang) {
      try {
        return new Intl.NumberFormat(LANG_TAG[lang] || "en-US").format(n);
      } catch (e) {
        return String(n);
      }
    },

    fmtDate(iso, lang) {
      if (!iso) return "-";
      const [y, m, d] = iso.split("-").map(Number);
      const dt = new Date(Date.UTC(y, (m || 1) - 1, d || 1));
      try {
        return new Intl.DateTimeFormat(LANG_TAG[lang] || "en-US", {
          year: "numeric", month: "2-digit", day: "2-digit", timeZone: "UTC"
        }).format(dt);
      } catch (e) {
        return iso;
      }
    },

    weekdayName(date, lang) {
      try {
        return new Intl.DateTimeFormat(LANG_TAG[lang] || "en-US", { weekday: "short" }).format(date);
      } catch (e) {
        return "";
      }
    },

    /* Next scheduled draw (local calendar), never earlier than the last stored draw. */
    nextDraw(game, lastDateIso) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      let base = today;
      if (lastDateIso) {
        const [y, m, d] = lastDateIso.split("-").map(Number);
        const last = new Date(y, m - 1, d);
        const afterLast = new Date(last.getTime() + 86400000);
        if (afterLast > base) base = afterLast;
      }
      for (let i = 0; i < 8; i++) {
        const probe = new Date(base.getTime() + i * 86400000);
        if (game.drawDays.indexOf(probe.getDay()) !== -1) return probe;
      }
      return base;
    },

    drawNoLabel(game, d) {
      if (game.id === "us") return d.draw; // date string used as id
      return d.draw;
    },

    /* searchable text for a ticket, used for copy/csv */
    ticketLine(game, ticket, idx) {
      const extra = ticket.extra.length
        ? " + " + ticket.extra.join(" ")
        : "";
      return (idx !== undefined ? "#" + (idx + 1) + "  " : "") + ticket.main.join(" ") + extra;
    }
  };

  window.LL = LL;
})();
