/* ============================================================
   LottoLab Global — app orchestration
   ============================================================ */
(function () {
  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));

  const state = {
    gameId: "kr",
    lang: "ko",
    tab: "stats",
    payload: null,
    stats: null,
    cache: {},
    license: null,
    pro: false,
    freeUsed: 0,
    freeGames: [],
    proGames: [],
    lastFreeDate: null,
    busy: false,
    filters: {
      hotW: 0.35,
      coldW: 0.15,
      oddEven: "any",
      sumMin: null,
      sumMax: null,
      noConsecutive: true
    },
    pick: { fixed: new Set(), excluded: new Set() }
  };

  /* ── small utilities ─────────────────────────────────── */
  const game = () => LL.game(state.gameId);

  function isoLocal(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }

  function todayKey() {
    return isoLocal(new Date());
  }

  function store(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch (e) { /* private mode */ }
  }
  function read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function ballHTML(n, g, size) {
    return '<span class="ball' + (size ? " " + size : "") + '" data-tone="' + LL.tone(g, n) + '">' + n + "</span>";
  }
  function extraBallHTML(n, g, size) {
    return '<span class="ball' + (size ? " " + size : "") + '" data-tone="' + LL.extraTone(g) + '">' + n + "</span>";
  }
  function ticketHTML(t, g) {
    let html = '<div class="ball-row">';
    t.main.forEach((n) => { html += ballHTML(n, g, "sm"); });
    html += "</div>";
    return html;
  }

  function drawCount(n) {
    return LL.fmtInt(n, state.lang) + (state.lang === "en" ? " " : "") + t("common.drawUnit");
  }

  function fmtPct(x, digits) {
    const d = digits === undefined ? 2 : digits;
    return (x * 100).toFixed(d) + "%";
  }

  /* ── i18n ────────────────────────────────────────────── */
  function applyI18n() {
    document.body.dataset.lang = state.lang;
    document.documentElement.lang = state.lang;
    $$("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      el.textContent = t(key);
    });
    const sel = $("#langSelect");
    if (sel && sel.value !== state.lang) sel.value = state.lang;
    document.title = "LottoLab Global — " + t("games." + state.gameId + ".name");
  }

  function setLang(lang, silent) {
    if (!window.I18N[lang]) lang = "ko";
    state.lang = lang;
    const prefs = read(CONFIG.STORAGE.prefs) || {};
    prefs.lang = lang;
    store(CONFIG.STORAGE.prefs, prefs);
    applyI18n();
    renderAll();
    if (!silent) setTab(state.tab, true);
  }

  /* ── data ────────────────────────────────────────────── */
  function loadData(gameId) {
    const g = LL.game(gameId);
    if (state.cache[gameId]) {
      state.payload = state.cache[gameId].payload;
      state.stats = state.cache[gameId].stats;
      renderAll();
      return Promise.resolve();
    }
    $("#dataRange").textContent = t("common.loading");
    return fetch(g.dataUrl)
      .then((r) => {
        if (!r.ok) throw new Error("HTTP " + r.status);
        return r.json();
      })
      .then((payload) => {
        const stats = LLStats.compute(g, payload.draws);
        state.cache[gameId] = { payload, stats };
        if (state.gameId !== gameId) return;
        state.payload = payload;
        state.stats = stats;
        renderAll();
      })
      .catch((err) => {
        console.error("data load failed", err);
        $("#dataRange").textContent = t("common.loadError");
        $("#dataPeriod").textContent = "-";
        $("#dataUpdated").textContent = "-";
      });
  }

  /* ── hero ────────────────────────────────────────────── */
  function renderHero() {
    const g = game();
    const p = state.payload;
    $("#heroFlag").innerHTML = LL.flagSVG(g.id);
    $$("[data-flag]").forEach((el) => {
      if (!el.firstChild) el.innerHTML = LL.flagSVG(el.dataset.flag);
    });
    $("#heroCountry").textContent = t("games." + g.id + ".country");
    $("#heroRule").textContent = t("games." + g.id + ".rule");
    $("#heroTitle").textContent = t("games." + g.id + ".name");
    $("#heroDesc").textContent = t("games." + g.id + ".desc");
    $("#heroPrice").textContent = g.price[state.lang] || g.price.en;
    $("#heroOdds").textContent = "1 / " + LL.fmtInt(LL.odds(g), state.lang);

    if (p) {
      const last = p.meta.last_draw ? p.meta.last_draw.date : null;
      const next = LL.nextDraw(g, last);
      $("#heroNextDraw").textContent =
        LL.fmtDate(isoLocal(next), state.lang) + " (" + LL.weekdayName(next, state.lang) + ")";
      $("#dataRange").textContent = drawCount(p.draws.length);
      $("#dataPeriod").textContent = p.draws.length
        ? LL.fmtDate(p.draws[0].date, state.lang) + " – " + LL.fmtDate(p.draws[p.draws.length - 1].date, state.lang)
        : "-";
      const fetched = (p.meta.fetched_at || "").slice(0, 10);
      $("#dataUpdated").textContent = fetched ? LL.fmtDate(fetched, state.lang) : "-";
      const src = $("#dataSource");
      src.textContent = p.meta.source_name;
      src.href = p.meta.source_url || "#";
    }
  }

  /* ── stats panel ─────────────────────────────────────── */
  function renderStats() {
    const g = game();
    const s = state.stats;
    if (!s) return;

    $("#kpiDraws").textContent = LL.fmtInt(s.total, state.lang);
    $("#kpiDrawsSub").textContent = s.lastDate ? LL.fmtDate(s.lastDate, state.lang) : "";

    $("#kpiHot").innerHTML = ballHTML(s.top.n, g) + " <small>" + s.top.freq + "</small>";
    $("#kpiHotSub").textContent = s.top.freq + t("stats.hotSuffix");
    $("#kpiCold").innerHTML = ballHTML(s.bottom.n, g) + " <small>" + s.bottom.freq + "</small>";
    $("#kpiColdSub").textContent = s.bottom.freq + t("stats.coldSuffix");

    const ov = s.overdue[0];
    $("#kpiOverdue").innerHTML = ballHTML(ov.n, g) + " <small>" + ov.gap + "</small>";
    $("#kpiOverdueSub").textContent = ov.lastDate
      ? LL.fmtDate(ov.lastDate, state.lang) + " · " + t("stats.gap", { n: ov.gap })
      : t("stats.never");

    $("#freqSub").textContent = t("stats.freqSub", { n: g.mainMax, draws: LL.fmtInt(s.total, state.lang) });
    renderFreqChart(g, s);

    renderRankList($("#hotList"), g, s.hot, s);
    renderRankList($("#coldList"), g, s.cold, s);

    $("#overdueList").innerHTML = s.overdue.map((x) => (
      '<div class="overdue-item">' + ballHTML(x.n, g, "sm") +
      '<div class="ov-meta"><span class="ov-gap">' + t("stats.gap", { n: x.gap }) + "</span>" +
      '<span class="ov-date">' + (x.lastDate ? LL.fmtDate(x.lastDate, state.lang) : t("stats.never")) + "</span></div></div>"
    )).join("");

    renderDistribution($("#oddEvenDist"), s, s.oddEven, "odd");
    renderDistribution($("#lowHighDist"), s, s.lowHigh, "low");
    renderDistribution($("#sumDist"), s, sumBucketSeries(s), "sum");

    $("#lowHighNote").textContent = t("stats.lowHighNote", { max: s.lowCut });
    $("#sumNote").textContent = t("stats.sumNote", { pick: g.pick });

    const scopeAll = $("#btScope option[value='all']");
    if (scopeAll) scopeAll.textContent = t("bt.scopeAll", { n: LL.fmtInt(s.total, state.lang) });
    const o100 = $("#btScope option[value='100']");
    if (o100) o100.textContent = t("bt.scope100");
    const o300 = $("#btScope option[value='300']");
    if (o300) o300.textContent = t("bt.scope300");

    // 4th column header switches with the game's bonus ball name
    const th = $("#colExtra");
    if (th) th.textContent = t("extra." + g.extraType);

    renderRecent(g, s);
  }

  function renderRankList(el, g, list, s) {
    const maxFreq = Math.max(1, s.fMax);
    el.innerHTML = list.map((x, i) => (
      '<li><span class="rank-no">' + (i + 1) + "</span>" + ballHTML(x.n, g, "sm") +
      '<span class="rank-bar"><i style="width:' + Math.max(4, (x.freq / maxFreq) * 100).toFixed(1) + '%"></i></span>' +
      '<span class="rank-name">' + x.freq + t("stats.hotSuffix") + "</span></li>"
    )).join("");
  }

  function sumBucketSeries(s) {
    const arr = s.sumBuckets.map((b) => ({ label: b.from + "–" + b.to, value: b.count }));
    return arr;
  }

  function renderDistribution(el, s, series, kind) {
    let items;
    if (kind === "sum") {
      items = series;
    } else {
      items = [];
      for (let i = 0; i < series.length; i++) items.push({ label: String(i), value: series[i] });
    }
    const max = Math.max.apply(null, items.map((x) => x.value).concat([1]));
    const total = items.reduce((a, b) => a + b.value, 0) || 1;
    el.innerHTML = items.map((x) => (
      '<div class="dist-row"><span class="dist-key">' + x.label + "</span>" +
      '<span class="dist-bar"><i style="width:' + ((x.value / max) * 100).toFixed(1) + '%"></i></span>' +
      '<span class="dist-val">' + fmtPct(x.value / total, 1) + "</span></div>"
    )).join("");
  }

  function renderFreqChart(g, s) {
    const max = g.mainMax;
    const host = $("#freqChart");
    const cw = (host && host.clientWidth) || 1000;
    const colW = Math.max(15, Math.min(30, Math.floor((cw - 24) / max)));
    const W = Math.max(cw, max * colW + 16);
    const labelEvery = colW >= 21 ? 1 : colW >= 17 ? 2 : 5;
    const H = 200;
    const top = 14;
    const base = 158;
    const maxF = Math.max(1, s.fMax);
    let bars = "";
    let labels = "";
    for (let n = 1; n <= max; n++) {
      const x = 12 + (n - 1) * colW;
      const h = Math.max(2, ((s.freq[n] / maxF) * (base - top)));
      const y = base - h;
      const cls = s.hotSet.has(n) ? "#ff7a59" : s.coldSet.has(n) ? "#5b8def" : "#495569";
      bars += '<rect class="bar-rect" x="' + (x + 4) + '" y="' + y.toFixed(1) + '" width="' + (colW - 9) +
        '" height="' + h.toFixed(1) + '" rx="3" fill="' + cls + '"><title>' + n + " · " + s.freq[n] +
        t("stats.hotSuffix") + "</title></rect>";
      if ((n - 1) % labelEvery === 0) {
        labels += '<text x="' + (x + colW / 2 - 0.5) + '" y="' + (base + 14) + '" text-anchor="middle" font-size="9" fill="#7f8a9f">' + n + "</text>";
      }
    }
    const avgY = base - (s.expected / maxF) * (base - top);
    const avg = '<line x1="8" x2="' + (W - 8) + '" y1="' + avgY.toFixed(1) + '" y2="' + avgY.toFixed(1) +
      '" stroke="rgba(255,255,255,.22)" stroke-dasharray="4 4" stroke-width="1"/>' +
      '<text x="' + (W - 10) + '" y="' + (avgY - 4).toFixed(1) + '" text-anchor="end" font-size="9" fill="#9aa4b8">avg ' +
      s.expected.toFixed(1) + "</text>";
    const grid = [0, 0.25, 0.5, 0.75, 1].map((f) => (
      '<line x1="8" x2="' + (W - 8) + '" y1="' + (base - f * (base - top)).toFixed(1) + '" y2="' +
      (base - f * (base - top)).toFixed(1) + '" stroke="rgba(255,255,255,.05)" stroke-width="1"/>'
    )).join("");
    $("#freqChart").innerHTML =
      '<svg viewBox="0 0 ' + W + " " + H + '" width="' + W + '" height="' + H + '" role="img" aria-label="' +
      t("stats.freqTitle") + '">' + grid + avg + bars + labels + "</svg>";
  }

  function renderRecent(g, s) {
    const draws = state.payload ? state.payload.draws.slice(-10).reverse() : [];
    $("#recentBody").innerHTML = draws.map((d) => (
      "<tr><td class=\"d-no\">" + (g.id === "us" ? LL.fmtDate(d.date, state.lang) : d.draw) + "</td>" +
      '<td class="d-date">' + LL.fmtDate(d.date, state.lang) + "</td>" +
      "<td><div class=\"ball-row\">" + d.main.map((n) => ballHTML(n, g, "sm")).join("") + "</div></td>" +
      "<td><div class=\"ball-row\">" + (d.extra || []).map((n) => extraBallHTML(n, g, "ball-xs")).join("") + "</div></td></tr>"
    )).join("");
  }

  /* ── OMR slip ────────────────────────────────────────── */
  function omrSlipHTML(g, tickets) {
    if (!tickets.length) return "";
    const perSlip = 5; // real slips hold five games (A–E)
    const slips = [];
    for (let i = 0; i < tickets.length; i += perSlip) slips.push(tickets.slice(i, i + perSlip));
    return slips.map((chunk, page) => buildSlip(g, chunk, page, slips.length)).join("");
  }

  function buildSlip(g, tickets, page, pages) {
    const letters = "ABCDEFGHIJ";
    const body = tickets.map((tk, idx) => {
      let cells = "";
      for (let n = 1; n <= g.mainMax; n++) {
        const on = tk.main.indexOf(n) !== -1;
        cells += '<span class="omr-cell' + (on ? " is-marked" : "") + '">' + n + "</span>";
      }
      let extra = "";
      if (g.extraType === "bonus") {
        extra = '<p class="omr-sub omr-bonus">' + t("extra.bonus") + " <b>" + tk.extra.join(" · ") + "</b></p>";
      } else if (g.extraCount > 0) {
        let ecells = "";
        for (let n = 1; n <= g.extraMax; n++) {
          const on = tk.extra.indexOf(n) !== -1;
          ecells += '<span class="omr-cell' + (on ? " is-marked " + (g.extraType === "luckystar" ? "is-star" : "is-extra") : "") + '">' + n + "</span>";
        }
        const cols = Math.min(13, g.extraMax);
        extra =
          '<p class="omr-sub">' + t("extra." + g.extraType).toUpperCase() + "</p>" +
          '<div class="omr-grid omr-extra-grid" style="grid-template-columns:repeat(' + cols + ',1fr);max-width:' + (cols * 30) + 'px">' + ecells + "</div>";
      }
      return (
        '<div class="omr-game"><div class="omr-letter">' + letters[idx] + "</div>" +
        '<div class="omr-grid" style="grid-template-columns:repeat(' + g.slipCols + ',1fr)">' + cells + "</div>" +
        '<div class="omr-extra">' + extra + "</div></div>"
      );
    }).join("");
    const countLabel = pages > 1 ? (page + 1) + "/" + pages : "";
    return (
      '<div class="omr-slip"><div class="omr-head"><span>' + t("games." + g.id + ".name") + " · " + t("gen.slipPreview") +
      "</span><em>" + countLabel + "</em></div>" +
      '<div class="omr-body">' + body + "</div>" +
      '<div class="omr-foot"><span>' + t("gen.slipPrice") + " · " + (g.price[state.lang] || g.price.en) + "</span><span>" +
      LL.fmtDate(todayKey(), state.lang) + "</span></div></div>"
    );
  }

  function renderGames(el, tickets) {
    const g = game();
    if (!tickets.length) {
      el.innerHTML = '<p class="hint">' + t("gen.empty") + "</p>";
      return;
    }
    el.innerHTML = tickets.map((tk, i) => (
      '<div class="game-card"><div class="game-card-top"><span class="game-tag">' + t("gen.gameLabel", { n: i + 1 }) +
      "</span>" + (tk.extra.length ? '<span class="game-extra">+ ' + (tk.extra || []).map((n) => extraBallHTML(n, g, "ball-xs")).join("") + "</span>" : "") +
      "</div>" + ticketHTML(tk, g) + "</div>"
    )).join("");
  }

  /* ── free tier ───────────────────────────────────────── */
  function loadFreeState() {
    const rec = read(CONFIG.STORAGE.freeUse);
    if (rec && rec.date === todayKey()) {
      state.freeUsed = rec.count || 0;
      state.lastFreeDate = rec.date;
    } else {
      state.freeUsed = 0;
      state.lastFreeDate = null;
    }
  }

  function saveFreeState() {
    store(CONFIG.STORAGE.freeUse, { date: todayKey(), count: state.freeUsed });
  }

  function renderFreeState() {
    const limit = CONFIG.FREE_GENERATIONS_PER_DAY;
    const left = Math.max(0, limit - state.freeUsed);
    const el = $("#freeLeft");
    el.innerHTML = left > 0
      ? t("gen.freeLeft", { left: left, limit: limit })
      : t("gen.freeExhausted");
  }

  function generateFree() {
    if (state.busy) return;
    const limit = CONFIG.FREE_GENERATIONS_PER_DAY;
    if (state.freeUsed >= limit) {
      openModal();
      toast(t("toast.freeUsed"));
      return;
    }
    const g = game();
    const weights = LLGen.uniformWeights(g);
    const rng = Math.random;
    const tickets = LLGen.generate(g, { noConsecutive: false }, CONFIG.FREE_GAMES_PER_GENERATION, weights, rng);
    state.freeUsed += 1;
    saveFreeState();
    state.freeGames = tickets;
    $("#freeResultCard").hidden = false;
    $("#resultTitle").textContent = t("gen.gamesTitle") + " · " + t("pro.sGames", { n: tickets.length });
    renderGames($("#gameCards"), tickets);
    $("#omrWrap").innerHTML = omrSlipHTML(g, tickets);
    $("#omrHint").hidden = true;
    renderFreeState();
  }

  /* ── PRO filters ─────────────────────────────────────── */
  function isPro() {
    if (!state.license) return false;
    if (state.license.until) {
      const until = new Date(state.license.until + "T23:59:59");
      if (Date.now() > until.getTime()) return false;
    }
    return true;
  }

  function applyProState() {
    state.pro = isPro();
    document.body.classList.toggle("is-pro", state.pro);
    $$(".pro-gated").forEach((el) => {
      el.classList.toggle("is-locked", !state.pro);
      const gate = el.querySelector(".gate");
      if (gate) gate.hidden = state.pro;
    });
    const chipLabel = $(".pro-chip-label");
    const chip = $("#proChip");
    if (state.pro) {
      const until = state.license && state.license.until
        ? " · " + LL.fmtDate(state.license.until, state.lang)
        : "";
      chipLabel.textContent = t("header.proActive") + until;
      chip.setAttribute("aria-label", t("header.proActive"));
      const cta = chip.querySelector(".pro-chip-cta");
      if (cta) cta.textContent = "✓";
    } else {
      chipLabel.textContent = t("header.freePlan");
      chip.setAttribute("aria-label", t("header.freePlan"));
      const cta2 = chip.querySelector(".pro-chip-cta");
      if (cta2) cta2.textContent = "PRO";
    }
    const buy = $("#buyBtn");
    if (buy) buy.href = CONFIG.PRO_BUY_URL;
  }

  function renderPickGrids() {
    const g = game();
    ["fixed", "excluded"].forEach((kind) => {
      const grid = $("#" + kind + "Grid");
      if (!grid) return;
      let html = "";
      for (let n = 1; n <= g.mainMax; n++) {
        const on = state.pick[kind].has(n);
        html += '<button type="button" class="pick-num' + (on ? " is-" + kind : "") + '" data-pick="' + kind + '" data-n="' + n + '" aria-pressed="' + on + '">' + n + "</button>";
      }
      grid.innerHTML = html;
    });
    $("#fixedCount").textContent = state.pick.fixed.size;
    $("#excludedCount").textContent = state.pick.excluded.size;
  }

  function readFilters() {
    return {
      hotW: Number($("#hotWeight").value) / 100,
      coldW: Number($("#coldWeight").value) / 100,
      oddEven: $("#oddEven").value,
      sumMin: $("#sumMin").value === "" ? null : Number($("#sumMin").value),
      sumMax: $("#sumMax").value === "" ? null : Number($("#sumMax").value),
      noConsecutive: $("#noConsecutive").checked,
      fixed: Array.from(state.pick.fixed),
      excluded: Array.from(state.pick.excluded)
    };
  }

  function filterSummary(f, g) {
    const parts = [];
    if (f.hotW > 0 || f.coldW > 0) parts.push(t("pro.sWeight", { h: Math.round(f.hotW * 100), c: Math.round(f.coldW * 100) }));
    if (f.oddEven !== "any") parts.push(t("pro.sOdd", { v: f.oddEven.replace(":", " : ") }));
    if (f.sumMin !== null || f.sumMax !== null) {
      parts.push(t("pro.sSum", { min: f.sumMin === null ? "-" : f.sumMin, max: f.sumMax === null ? "-" : f.sumMax }));
    }
    if (f.noConsecutive) parts.push(t("pro.consecutive"));
    if (f.fixed.length) parts.push(t("pro.sFixed", { list: f.fixed.join(",") }));
    if (f.excluded.length) parts.push(t("pro.sExcluded", { list: f.excluded.join(",") }));
    return parts.join(" · ");
  }

  function generatePro() {
    if (!state.pro) { openModal(); return; }
    if (state.busy) return;
    const g = game();
    const count = Number($("#proGameCount").value) || 10;
    const f = readFilters();
    const maxFixed = g.pick - 1;
    if (f.fixed.length > maxFixed) {
      toast(t("pro.tooManyFixed", { max: maxFixed }));
      return;
    }
    const stats = state.stats;
    const weights = stats
      ? LLStats.weights(stats, g, f.hotW, f.coldW)
      : LLGen.uniformWeights(g);
    let tickets;
    try {
      tickets = LLGen.generate(g, f, count, weights, Math.random);
    } catch (err) {
      toast(t("pro.conflict", { n: count }));
      return;
    }
    state.proGames = tickets;
    state.activeFilters = f;
    $("#proResultCard").hidden = false;
    $("#proResultTitle").textContent = t("pro.resultTitle") + " · " + t("pro.sGames", { n: tickets.length });
    $("#filterSummary").textContent = filterSummary(f, g) + " · " + t("pro.sGames", { n: tickets.length });
    renderGames($("#proGameCards"), tickets);
    $("#proOmr").innerHTML = omrSlipHTML(g, tickets);
    $("#proResultCard").scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  /* ── backtest ────────────────────────────────────────── */
  function runBacktest() {
    if (!state.pro) { openModal(); return; }
    if (state.busy || !state.stats) return;
    const g = game();
    const f = readFilters();
    const maxFixed = g.pick - 1;
    if (f.fixed.length > maxFixed) {
      toast(t("pro.tooManyFixed", { max: maxFixed }));
      return;
    }
    state.busy = true;
    const btn = $("#btnBacktest");
    const label = btn.querySelector("span:last-child");
    const original = label.textContent;
    label.textContent = t("bt.running");
    btn.disabled = true;

    setTimeout(() => {
      let res;
      try {
        res = LLBacktest.run(g, state.payload.draws, f, {
          scope: $("#btScope").value,
          gamesPerDraw: $("#btGames").value
        });
      } finally {
        btn.disabled = false;
        label.textContent = original;
        state.busy = false;
      }
      if (res.failure) {
        toast(t("pro.conflict", { n: Number($("#btGames").value) }));
        return;
      }
      renderBacktest(g, res, f);
    }, 40);
  }

  function renderBacktest(g, r, f) {
    $("#btResultCard").hidden = false;
    $("#btScopeLabel").textContent =
      t("bt.range", {
        from: g.id === "us" ? LL.fmtDate(r.fromDate, state.lang) : r.fromDraw,
        to: g.id === "us" ? LL.fmtDate(r.toDate, state.lang) : r.toDraw
      });
    $("#btGamesCount").textContent = LL.fmtInt(r.games, state.lang);
    $("#btHitRate").textContent = fmtPct(r.hitRate, 2);
    $("#btBaseline").textContent = fmtPct(r.baseline, 2);
    const d = r.delta * 100;
    $("#btDelta").textContent = (d >= 0 ? "+" : "") + d.toFixed(2) + " pp";
    $("#btDelta").style.color = d >= 0 ? "#2ec4b6" : "#ff8b8f";

    const total = r.games || 1;
    let html = "";
    for (let k = 0; k <= g.pick; k++) {
      const c = r.dist[k] || 0;
      html += '<div class="dist-row"><span class="dist-key">' + t("bt.matchN", { n: k }) + "</span>" +
        '<span class="dist-bar"><i style="width:' + ((c / total) * 100).toFixed(2) + "%;" +
        (k >= 3 ? "background:linear-gradient(90deg,#2ec4b6,#7ce0c3);" : "") + '"></i></span>' +
        '<span class="dist-val">' + LL.fmtInt(c, state.lang) + " · " + fmtPct(c / total, 2) + "</span></div>";
    }
    $("#btDist").innerHTML = html;
  }

  /* ── license / modal ─────────────────────────────────── */
  function openModal() {
    const modal = $("#proModal");
    modal.hidden = false;
    document.body.style.overflow = "hidden";
    const input = $("#codeInput");
    if (input) setTimeout(() => input.focus(), 40);
  }
  function closeModal() {
    $("#proModal").hidden = true;
    document.body.style.overflow = "";
    $("#codeError").hidden = true;
  }

  function activateCode(raw) {
    const code = String(raw || "").trim().toUpperCase();
    const found = CONFIG.LICENSES.filter((l) => l.code.toUpperCase() === code)[0];
    const errEl = $("#codeError");
    if (!found) {
      errEl.textContent = t("modal.invalid");
      errEl.hidden = false;
      return;
    }
    if (found.plan === "trial" && state.license && state.license.plan === "trial") {
      const expired = !isPro();
      if (expired) {
        errEl.textContent = t("modal.expired");
        errEl.hidden = false;
        return;
      }
    }
    let until = null;
    if (found.days) {
      const d = new Date();
      d.setDate(d.getDate() + found.days);
      until = d.toISOString().slice(0, 10);
    }
    state.license = {
      code: found.code,
      plan: found.plan,
      activatedAt: todayKey(),
      until: until
    };
    store(CONFIG.STORAGE.license, state.license);
    applyProState();
    closeModal();
    toast(found.plan === "trial" ? t("toast.trialOn") : t("modal.success"));
    showLicenseState();
  }

  function showLicenseState() {
    const box = $("#licenseState");
    if (!box) return;
    if (state.pro && state.license) {
      box.hidden = false;
      box.textContent = state.license.until
        ? t("modal.proUntil", { date: LL.fmtDate(state.license.until, state.lang) })
        : t("header.proActive") + " · " + state.license.code;
    } else {
      box.hidden = true;
    }
  }

  function restoreLicense() {
    const rec = read(CONFIG.STORAGE.license);
    if (rec && rec.code) state.license = rec;
    if (state.license && state.license.until) {
      const until = new Date(state.license.until + "T23:59:59");
      if (Date.now() > until.getTime()) state.pro = false;
    }
  }

  /* ── toast ───────────────────────────────────────────── */
  let toastTimer = null;
  function toast(msg) {
    const el = $("#toast");
    el.textContent = msg;
    el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 3200);
  }

  /* ── clipboard & csv ─────────────────────────────────── */
  function ticketsText(tickets) {
    return tickets.map((t, i) => LL.ticketLine(game(), t, i)).join("\n");
  }

  function copyTickets(tickets) {
    const text = ticketsText(tickets);
    const done = () => toast(t("common.copied"));
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(done).catch(fallback);
    } else {
      fallback();
    }
    function fallback() {
      try {
        const ta = document.createElement("textarea");
        ta.value = text;
        ta.style.position = "fixed";
        ta.style.opacity = "0";
        document.body.appendChild(ta);
        ta.select();
        const ok = document.execCommand("copy");
        document.body.removeChild(ta);
        toast(ok ? t("common.copied") : t("common.copyFail"));
      } catch (e) {
        toast(t("common.copyFail"));
      }
    }
  }

  function exportCsv(tickets) {
    const g = game();
    const head = ["game", "no1", "no2", "no3", "no4", "no5", "no6"].slice(0, g.pick + 1);
    g.extraCount === 2 ? head.push("extra1", "extra2") : head.push("extra1");
    const rows = tickets.map((t, i) => {
      const row = [i + 1].concat(t.main);
      t.extra.forEach((n) => row.push(n));
      return row.join(",");
    });
    const csv = "\uFEFF" + head.join(",") + "\n" + rows.join("\n") + "\n";
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "lottolab-" + g.id + "-" + todayKey() + ".csv";
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      URL.revokeObjectURL(a.href);
      a.remove();
    }, 500);
    toast(t("common.csvSaved"));
  }

  /* ── tabs ────────────────────────────────────────────── */
  function setTab(tab, silent) {
    state.tab = tab;
    $$(".tab").forEach((b) => {
      const on = b.dataset.tab === tab;
      b.classList.toggle("is-active", on);
      b.setAttribute("aria-selected", on ? "true" : "false");
    });
    $$(".panel").forEach((p) => p.classList.toggle("is-active", p.id === "panel-" + tab));
    if (!silent) {
      const active = $("#panel-" + tab);
      if (active && window.scrollY > 120) active.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }

  /* ── master render ───────────────────────────────────── */
  function renderAll() {
    applyI18n();
    renderHero();
    renderStats();
    renderFreeState();
    renderPickGrids();
    applyProState();
    showLicenseState();
    if (state.freeGames.length) {
      renderGames($("#gameCards"), state.freeGames);
      $("#freeResultCard").hidden = false;
      $("#omrWrap").innerHTML = omrSlipHTML(game(), state.freeGames);
      $("#omrHint").hidden = true;
    } else {
      $("#freeResultCard").hidden = true;
      $("#omrWrap").innerHTML = "";
      $("#omrHint").hidden = false;
    }
    if (state.proGames.length) {
      const g = game();
      renderGames($("#proGameCards"), state.proGames);
      $("#proOmr").innerHTML = omrSlipHTML(g, state.proGames);
      $("#proResultCard").hidden = false;
      if (state.activeFilters) {
        $("#filterSummary").textContent = filterSummary(state.activeFilters, g) + " · " + t("pro.sGames", { n: state.proGames.length });
      }
    }
  }

  function switchGame(id) {
    if (!LL.GAMES[id] || id === state.gameId) return;
    state.gameId = id;
    state.freeGames = [];
    state.proGames = [];
    state.pick.fixed.clear();
    state.pick.excluded.clear();
    state.payload = null;
    state.stats = null;
    document.body.dataset.game = id;
    $$("[data-game-switch]").forEach((b) => b.classList.toggle("is-active", b.dataset.gameSwitch === id));
    const prefs = read(CONFIG.STORAGE.prefs) || {};
    prefs.game = id;
    store(CONFIG.STORAGE.prefs, prefs);
    state.lang = LL.game(id).lang;
    prefs.lang = state.lang;
    store(CONFIG.STORAGE.prefs, prefs);
    applyI18n();
    renderHero();
    renderPickGrids();
    loadData(id);
    setTab(state.tab, true);
  }

  /* ── events ──────────────────────────────────────────── */
  function bind() {
    $$("[data-game-switch]").forEach((btn) => {
      btn.addEventListener("click", () => switchGame(btn.dataset.gameSwitch));
    });
    $("#langSelect").addEventListener("change", (e) => setLang(e.target.value));

    $$(".tab").forEach((tab) => {
      tab.addEventListener("click", () => setTab(tab.dataset.tab));
    });

    document.addEventListener("click", (e) => {
      const opener = e.target.closest("[data-open-modal]");
      if (opener) {
        e.preventDefault();
        if (state.pro) { toast(t("modal.alreadyPro")); return; }
        openModal();
        return;
      }
      const closer = e.target.closest("[data-close-modal]");
      if (closer) { e.preventDefault(); closeModal(); return; }
      const pick = e.target.closest(".pick-num");
      if (pick) togglePick(pick);
    });

    document.addEventListener("keydown", (e) => {
      if (e.key === "Escape" && !$("#proModal").hidden) closeModal();
    });

    $("#codeForm").addEventListener("submit", (e) => {
      e.preventDefault();
      activateCode($("#codeInput").value);
    });
    $("#btnFillTrial").addEventListener("click", () => {
      $("#codeInput").value = "LOTTOLAB-TRIAL-2026";
      $("#codeInput").focus();
      $("#codeError").hidden = true;
    });

    $("#btnFreeGenerate").addEventListener("click", generateFree);
    $("#btnProGenerate").addEventListener("click", generatePro);
    $("#btnResetFilters").addEventListener("click", resetFilters);
    $("#btnBacktest").addEventListener("click", runBacktest);

    $("#btnCopy").addEventListener("click", () => copyTickets(state.freeGames));
    $("#btnCsvFree").addEventListener("click", () => exportCsv(state.freeGames));
    $("#btnCopyPro").addEventListener("click", () => copyTickets(state.proGames));
    $("#btnCsvPro").addEventListener("click", () => exportCsv(state.proGames));

    $("#hotWeight").addEventListener("input", (e) => { $("#hotOut").textContent = e.target.value; });
    $("#coldWeight").addEventListener("input", (e) => { $("#coldOut").textContent = e.target.value; });

  }

  function togglePick(el) {
    const kind = el.dataset.pick;
    const n = Number(el.dataset.n);
    const g = game();
    const set = state.pick[kind];
    const other = state.pick[kind === "fixed" ? "excluded" : "fixed"];
    if (set.has(n)) {
      set.delete(n);
    } else {
      if (kind === "fixed" && set.size >= g.pick - 1) {
        toast(t("pro.tooManyFixed", { max: g.pick - 1 }));
        return;
      }
      set.add(n);
      other.delete(n);
    }
    renderPickGrids();
  }

  function resetFilters() {
    state.pick.fixed.clear();
    state.pick.excluded.clear();
    $("#hotWeight").value = 35;
    $("#coldWeight").value = 15;
    $("#hotOut").textContent = "35";
    $("#coldOut").textContent = "15";
    $("#oddEven").value = "any";
    $("#sumMin").value = "";
    $("#sumMax").value = "";
    $("#noConsecutive").checked = true;
    renderPickGrids();
    toast(t("pro.reset"));
  }

  /* ── init ────────────────────────────────────────────── */
  function init() {
    const prefs = read(CONFIG.STORAGE.prefs) || {};
    state.gameId = LL.GAMES[prefs.game] ? prefs.game : "kr";
    state.lang = window.I18N[prefs.lang] ? prefs.lang : LL.game(state.gameId).lang;
    document.body.dataset.game = state.gameId;
    document.body.dataset.lang = state.lang;
    $$("[data-game-switch]").forEach((b) => b.classList.toggle("is-active", b.dataset.gameSwitch === state.gameId));

    restoreLicense();
    loadFreeState();
    bind();
    applyI18n();
    applyProState();
    showLicenseState();
    renderPickGrids();
    renderFreeState();
    setTab("stats", true);

    let resizeTimer = null;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(() => {
        if (state.stats) renderStats();
      }, 180);
    });

    // keep the free counter honest across midnight
    setInterval(() => {
      const rec = read(CONFIG.STORAGE.freeUse);
      if (!rec || rec.date !== todayKey()) {
        state.freeUsed = 0;
        renderFreeState();
      }
    }, 60000);

    loadData(state.gameId);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
