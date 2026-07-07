// Currency conversion. Rates are ECB/Frankfurter, stored EUR-based; we cross
// through EUR. A day with no rate (weekend/holiday) uses the last available
// PRIOR rate. A date AFTER the newest rate (today before ECB publishes, or a
// future-dated cost) clamps FORWARD to the newest rate — a dashboard must never
// go blank just because a row's date is a day or two ahead of the FX feed.

/**
 * Build a converter from fx rows [{date, base:'EUR', quote, rate}].
 * Returns convert(amount, from, to, date).
 */
export function makeConverter(fxRows) {
  // date -> { quote: rate } ; EUR is implicitly 1.
  const byDate = new Map();
  for (const r of fxRows) {
    if (!byDate.has(r.date)) byDate.set(r.date, { EUR: 1 });
    byDate.get(r.date)[r.quote] = r.rate;
  }
  const dates = [...byDate.keys()].sort(); // ascending ISO
  const maxDate = dates[dates.length - 1];

  function rateSetFor(date) {
    if (byDate.has(date)) return byDate.get(date);
    if (!dates.length) return null;
    if (date > maxDate) return byDate.get(maxDate); // no published rate yet → newest known
    // binary search for the latest date <= requested
    let lo = 0;
    let hi = dates.length - 1;
    let best = -1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (dates[mid] <= date) {
        best = mid;
        lo = mid + 1;
      } else {
        hi = mid - 1;
      }
    }
    return best >= 0 ? byDate.get(dates[best]) : null;
  }

  return function convert(amount, from, to, date) {
    if (amount === 0) return 0;
    const f = String(from || 'USD').toUpperCase();
    const t = String(to || 'USD').toUpperCase();
    if (f === t) return amount;
    const set = rateSetFor(date);
    if (!set) throw new Error(`sem taxa de câmbio para ${date} (futuro ou fora do range)`);
    const rf = f === 'EUR' ? 1 : set[f];
    const rt = t === 'EUR' ? 1 : set[t];
    if (rf == null || rt == null) throw new Error(`par de câmbio indisponível ${f}->${t} em ${date}`);
    // amount(from) → EUR → to.  set[X] means 1 EUR = set[X] X.
    const inEur = amount / rf;
    return inEur * rt;
  };
}

/** A no-op converter for same-currency scenarios / tests. */
export function identityConverter() {
  return (amount) => amount;
}
