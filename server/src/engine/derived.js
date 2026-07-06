// Derived metrics (S8.3). Effective RPM blends AdSense + Hotmart; cost per 1k
// views measures spend efficiency. Pure functions over a P&L line.
export function effectiveRpm(line) {
  if (!line || !line.views) return null;
  return (line.revenue_total / line.views) * 1000;
}

export function costPer1kViews(line) {
  if (!line || !line.views) return null;
  return (line.cost_total / line.views) * 1000;
}

/** Attach derived metrics to each line (non-mutating). */
export function withDerived(lines) {
  return lines.map((l) => ({
    ...l,
    effective_rpm: effectiveRpm(l),
    cost_per_1k_views: costPer1kViews(l),
  }));
}
