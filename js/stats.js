/* ============================================================
   LottoLab Global — statistics engine
   Pure functions over the stored draw list. No DOM here.
   ============================================================ */
(function () {
  function emptyCounts(size) {
    return new Array(size + 1).fill(0);
  }

  const LLStats = {
    /**
     * @param {object} game  game definition
     * @param {Array}  draws chronological list ({draw,date,main,extra})
     */
    compute(game, draws) {
      const max = game.mainMax;
      const pick = game.pick;
      const total = draws.length;
      const freq = emptyCounts(max);
      const extraFreq = emptyCounts(game.extraMax);
      const lastSeenIdx = new Array(max + 1).fill(-1);
      const oddEven = new Array(pick + 1).fill(0);
      const lowHigh = new Array(pick + 1).fill(0);
      const sums = [];
      const lowCut = Math.floor(max / 2);

      draws.forEach((d, i) => {
        let odd = 0;
        let low = 0;
        let sum = 0;
        d.main.forEach((n) => {
          if (n >= 1 && n <= max) {
            freq[n] += 1;
            lastSeenIdx[n] = i;
            if (n % 2 === 1) odd += 1;
            if (n <= lowCut) low += 1;
            sum += n;
          }
        });
        oddEven[odd] += 1;
        lowHigh[low] += 1;
        sums.push(sum);
        (d.extra || []).forEach((n) => {
          if (n >= 1 && n <= game.extraMax) extraFreq[n] += 1;
        });
      });

      const numbers = [];
      for (let n = 1; n <= max; n++) {
        numbers.push({
          n,
          freq: freq[n],
          gap: lastSeenIdx[n] === -1 ? total : total - 1 - lastSeenIdx[n],
          lastDate: lastSeenIdx[n] === -1 ? null : draws[lastSeenIdx[n]].date
        });
      }

      const byFreqDesc = numbers.slice().sort((a, b) => b.freq - a.freq || a.n - b.n);
      const byFreqAsc = numbers.slice().sort((a, b) => a.freq - b.freq || a.n - b.n);
      const byGapDesc = numbers.slice().sort((a, b) => b.gap - a.gap || a.n - b.n);

      const freqValues = numbers.map((x) => x.freq);
      const fMin = Math.min.apply(null, freqValues);
      const fMax = Math.max.apply(null, freqValues);
      const expected = (total * pick) / max;

      // sum histogram: buckets over the range actually observed, rounded to 5s
      const sumMinPossible = (pick * (pick + 1)) / 2;
      const sumMaxPossible = (pick * (2 * max - pick + 1)) / 2;
      const obsMin = sums.length ? Math.min.apply(null, sums) : sumMinPossible;
      const obsMax = sums.length ? Math.max.apply(null, sums) : sumMaxPossible;
      const bucketCount = 9;
      const rawStep = (obsMax - obsMin + 1) / bucketCount;
      const step = Math.max(1, Math.ceil(rawStep / 5) * 5);
      const buckets = [];
      for (let s = Math.floor(obsMin / 5) * 5; s <= obsMax; s += step) {
        buckets.push({ from: s, to: Math.min(s + step - 1, Math.ceil(obsMax / 5) * 5), count: 0 });
      }
      sums.forEach((v) => {
        let idx = buckets.findIndex((b) => v >= b.from && v <= b.to);
        if (idx < 0) idx = buckets.length - 1;
        buckets[idx].count += 1;
      });

      const topPct = Math.max(1, Math.round(max * 0.1));
      const hotSet = new Set(byFreqDesc.slice(0, topPct).map((x) => x.n));
      const coldSet = new Set(byFreqAsc.slice(0, topPct).map((x) => x.n));

      return {
        total,
        freq,
        extraFreq,
        numbers,
        hot: byFreqDesc.slice(0, 10),
        cold: byFreqAsc.slice(0, 10),
        overdue: byGapDesc.slice(0, 10),
        obstacle: byGapDesc[0] || null,
        top: byFreqDesc[0],
        bottom: byFreqAsc[0],
        fMin,
        fMax,
        expected,
        oddEven,
        lowHigh,
        lowCut,
        sums,
        sumBuckets: buckets,
        avgSum: sums.length ? sums.reduce((a, b) => a + b, 0) / sums.length : 0,
        hotSet,
        coldSet,
        lastDate: total ? draws[total - 1].date : null
      };
    },

    /* Weight vector aligned to number 1..max. */
    weights(stats, game, hotW, coldW) {
      const max = game.mainMax;
      const span = stats.fMax - stats.fMin || 1;
      const w = new Array(max + 1).fill(0);
      for (let n = 1; n <= max; n++) {
        const r = (stats.freq[n] - stats.fMin) / span; // 0..1
        const score = 1 + hotW * (2 * r - 1) + coldW * (1 - 2 * r);
        w[n] = Math.max(0.08, score);
      }
      return w;
    }
  };

  window.LLStats = LLStats;
})();
