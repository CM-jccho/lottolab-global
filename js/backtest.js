/* ============================================================
   LottoLab Global — walk-forward backtest
   Each draw is replayed using only the draws before it, so the
   weighting never sees the result it is being tested against.
   ============================================================ */
(function () {
  function comb(n, k) {
    if (k < 0 || k > n) return 0;
    let r = 1;
    for (let i = 1; i <= k; i++) r = (r * (n - k + i)) / i;
    return Math.round(r);
  }

  function baselineAtLeast3(game) {
    const n = game.mainMax;
    const k = game.pick;
    const total = comb(n, k);
    let p = 0;
    for (let hit = 3; hit <= k; hit++) {
      p += (comb(k, hit) * comb(n - k, k - hit)) / total;
    }
    return p;
  }

  const LLBacktest = {
    baselineAtLeast3,

    /**
     * @param {object} game
     * @param {Array}  draws      chronological
     * @param {object} filterOpts same shape as LLGen.generate opts
     * @param {object} cfg        {scope: 100|300|'all'|number, gamesPerDraw}
     */
    run(game, draws, filterOpts, cfg) {
      const total = draws.length;
      const warmup = Math.min(50, Math.max(5, Math.floor(total * 0.05)));
      let startIdx = warmup;
      if (cfg.scope !== "all") {
        const n = Number(cfg.scope) || 300;
        startIdx = Math.max(warmup, total - n);
      }
      const gamesPerDraw = Math.max(1, Number(cfg.gamesPerDraw) || 1);
      const dist = new Array(game.pick + 1).fill(0);
      let games = 0;
      let bonusHits = 0;
      let failure = null;

      // walk-forward frequency table
      const freq = new Array(game.mainMax + 1).fill(0);
      for (let i = 0; i < startIdx; i++) {
        draws[i].main.forEach((n) => { freq[n] += 1; });
      }

      for (let i = startIdx; i < total; i++) {
        const stats = {
          freq,
          fMin: Infinity,
          fMax: -Infinity
        };
        for (let n = 1; n <= game.mainMax; n++) {
          if (freq[n] < stats.fMin) stats.fMin = freq[n];
          if (freq[n] > stats.fMax) stats.fMax = freq[n];
        }
        const weights = window.LLStats.weights(stats, game, filterOpts.hotW || 0, filterOpts.coldW || 0);
        const rng = window.LLGen.mulberry32(0x9e3779b1 ^ (i * 2654435761));
        let tickets;
        try {
          tickets = window.LLGen.generate(game, filterOpts, gamesPerDraw, weights, rng);
        } catch (e) {
          if (e.code === "conflict" || e.code === "tooManyFixed") {
            failure = e.code;
            break;
          }
          throw e;
        }
        const winning = draws[i].main;
        const winSet = new Set(winning);
        const extraWin = new Set(draws[i].extra || []);
        tickets.forEach((t) => {
          let hits = 0;
          t.main.forEach((n) => { if (winSet.has(n)) hits += 1; });
          dist[hits] += 1;
          games += 1;
          if (t.extra.some((n) => extraWin.has(n))) bonusHits += 1;
        });
        draws[i].main.forEach((n) => { freq[n] += 1; });
      }

      const testedDraws = Math.max(0, Math.min(total, total) - startIdx);
      const hits3 = dist.slice(3).reduce((a, b) => a + b, 0);
      const base = baselineAtLeast3(game);
      return {
        failure,
        startIdx,
        endIdx: total - 1,
        fromDate: draws[startIdx] ? draws[startIdx].date : null,
        toDate: draws[total - 1] ? draws[total - 1].date : null,
        fromDraw: draws[startIdx] ? draws[startIdx].draw : null,
        toDraw: draws[total - 1] ? draws[total - 1].draw : null,
        testedDraws,
        games,
        dist,
        hits3,
        hitRate: games ? hits3 / games : 0,
        baseline: base,
        delta: games ? hits3 / games - base : 0,
        bonusHits,
        bonusRate: games ? bonusHits / games : 0
      };
    }
  };

  window.LLBacktest = LLBacktest;
})();
