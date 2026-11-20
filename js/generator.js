/* ============================================================
   LottoLab Global — ticket generator
   Weighted sampling without replacement + hard filters.
   Deterministic when a seeded RNG is supplied (backtests).
   ============================================================ */
(function () {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0;
      a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function weightedPick(items, weights, rng) {
    let sum = 0;
    for (let i = 0; i < items.length; i++) sum += weights[items[i]];
    if (sum <= 0) return items[Math.floor(rng() * items.length)];
    let r = rng() * sum;
    for (let i = 0; i < items.length; i++) {
      r -= weights[items[i]];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  }

  function sampleWithoutReplacement(items, weights, k, rng) {
    const pool = items.slice();
    const out = [];
    while (out.length < k && pool.length) {
      const chosen = weightedPick(pool, weights, rng);
      out.push(chosen);
      pool.splice(pool.indexOf(chosen), 1);
    }
    return out;
  }

  function hasConsecutive(nums) {
    const s = nums.slice().sort((a, b) => a - b);
    for (let i = 1; i < s.length; i++) if (s[i] - s[i - 1] === 1) return true;
    return false;
  }

  const DEFAULT_OPTS = {
    hotW: 0,
    coldW: 0,
    oddEven: "any",
    sumMin: null,
    sumMax: null,
    noConsecutive: false,
    fixed: [],
    excluded: []
  };

  const LLGen = {
    mulberry32,

    normalizeOpts(game, opts) {
      const o = Object.assign({}, DEFAULT_OPTS, opts || {});
      o.fixed = (o.fixed || []).filter((n) => n >= 1 && n <= game.mainMax);
      o.excluded = (o.excluded || []).filter((n) => n >= 1 && n <= game.mainMax);
      o.fixedSet = new Set(o.fixed);
      o.excluded = o.excluded.filter((n) => !o.fixedSet.has(n));
      o.excludedSet = new Set(o.excluded);
      if (o.oddEven === "any") o.oddTarget = null;
      else o.oddTarget = parseInt(String(o.oddEven).split(":")[0], 10);
      o.sumMin = o.sumMin === null || o.sumMin === "" || isNaN(o.sumMin) ? null : Number(o.sumMin);
      o.sumMax = o.sumMax === null || o.sumMax === "" || isNaN(o.sumMax) ? null : Number(o.sumMax);
      return o;
    },

    buildOne(game, opts, weights, rng) {
      const pick = game.pick;
      const max = game.mainMax;
      const fixed = opts.fixed;
      if (fixed.length > pick) {
        const err = new Error("too many fixed");
        err.code = "tooManyFixed";
        throw err;
      }

      const pool = [];
      for (let n = 1; n <= max; n++) {
        if (opts.fixedSet.has(n) || opts.excludedSet.has(n)) continue;
        pool.push(n);
      }
      const need = pick - fixed.length;
      if (pool.length < need) {
        const err = new Error("conflict");
        err.code = "conflict";
        throw err;
      }

      let oddPool = pool.filter((n) => n % 2 === 1);
      let evenPool = pool.filter((n) => n % 2 === 0);
      let oddNeed = null;
      let evenNeed = null;
      if (opts.oddTarget !== null) {
        const fixedOdd = fixed.filter((n) => n % 2 === 1).length;
        oddNeed = opts.oddTarget - fixedOdd;
        evenNeed = need - oddNeed;
        if (oddNeed < 0 || evenNeed < 0 || oddNeed > oddPool.length || evenNeed > evenPool.length) {
          const err = new Error("conflict");
          err.code = "conflict";
          throw err;
        }
      }

      // feasibility of the sum window before sampling
      const sortedPool = pool.slice().sort((a, b) => a - b);
      const fixedSum = fixed.reduce((a, b) => a + b, 0);
      const minSum = fixedSum + sortedPool.slice(0, need).reduce((a, b) => a + b, 0);
      const maxSum = fixedSum + sortedPool.slice(-need).reduce((a, b) => a + b, 0);
      if (opts.sumMin !== null && opts.sumMin > maxSum) {
        const err = new Error("conflict");
        err.code = "conflict";
        throw err;
      }
      if (opts.sumMax !== null && opts.sumMax < minSum) {
        const err = new Error("conflict");
        err.code = "conflict";
        throw err;
      }

      for (let attempt = 0; attempt < 400; attempt++) {
        let drawn;
        if (oddNeed === null) {
          drawn = sampleWithoutReplacement(pool, weights, need, rng);
        } else {
          drawn = sampleWithoutReplacement(oddPool, weights, oddNeed, rng).concat(
            sampleWithoutReplacement(evenPool, weights, evenNeed, rng)
          );
        }
        const main = fixed.concat(drawn).sort((a, b) => a - b);
        if (new Set(main).size !== pick) continue;
        if (opts.noConsecutive && hasConsecutive(main)) continue;
        const sum = main.reduce((a, b) => a + b, 0);
        if (opts.sumMin !== null && sum < opts.sumMin) continue;
        if (opts.sumMax !== null && sum > opts.sumMax) continue;
        return main;
      }

      const err = new Error("conflict");
      err.code = "conflict";
      throw err;
    },

    pickExtras(game, rng) {
      const out = [];
      while (out.length < game.extraCount) {
        const n = 1 + Math.floor(rng() * game.extraMax);
        if (out.indexOf(n) === -1) out.push(n);
      }
      return out.sort((a, b) => a - b);
    },

    /**
     * @returns {Array<{main:number[], extra:number[]}>}
     * throws {code:'conflict'|'tooManyFixed'}
     */
    generate(game, opts, count, weights, rng) {
      const o = this.normalizeOpts(game, opts);
      const seen = new Set();
      const out = [];
      let guard = 0;
      while (out.length < count) {
        guard += 1;
        if (guard > count * 60 + 60) {
          const err = new Error("conflict");
          err.code = "conflict";
          throw err;
        }
        const main = this.buildOne(game, o, weights, rng);
        const key = main.join(",");
        if (seen.has(key)) continue; // avoid duplicate tickets inside one batch
        seen.add(key);
        out.push({ main, extra: this.pickExtras(game, rng) });
      }
      return out;
    },

    /* Uniform weights (free tier: no statistical tilt) */
    uniformWeights(game) {
      const w = new Array(game.mainMax + 1).fill(1);
      w[0] = 0;
      return w;
    }
  };

  window.LLGen = LLGen;
})();
