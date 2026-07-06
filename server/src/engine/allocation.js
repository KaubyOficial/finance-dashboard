// Shared-cost allocation across channels for a single month (S3.2). Pure.
// `revenueByChannel` is a Map channelId -> revenue (display currency) for the month.
// `activeChannels` is the list of channel ids that existed during the month.

/**
 * @returns Map channelId -> allocated amount (display currency). Sums to `amount`
 *          exactly (last channel absorbs rounding residue → additivity holds).
 */
export function allocateShared(cost, amount, { activeChannels, revenueByChannel }) {
  const rule = cost.allocation_rule || 'equal';
  const channels = activeChannels.slice();
  const out = new Map();
  if (channels.length === 0) return out;

  let weights;
  if (rule === 'equal') {
    weights = channels.map(() => 1);
  } else if (rule === 'by_revenue') {
    const revs = channels.map((c) => Math.max(0, revenueByChannel.get(c) || 0));
    const totalRev = revs.reduce((a, b) => a + b, 0);
    // No revenue anywhere this month → fall back to equal (documented).
    weights = totalRev > 0 ? revs : channels.map(() => 1);
  } else if (rule === 'custom') {
    const pct = parseCustom(cost.allocation_custom);
    const sum = Object.values(pct).reduce((a, b) => a + b, 0);
    if (Math.abs(sum - 100) > 0.01) {
      throw new Error(`allocation_custom do custo ${cost.id ?? '(sem id)'} soma ${sum}%, deveria ser 100%`);
    }
    weights = channels.map((c) => pct[c] || 0);
  } else {
    throw new Error(`allocation_rule desconhecida: "${rule}"`);
  }

  const totalW = weights.reduce((a, b) => a + b, 0);
  if (totalW === 0) return out;

  let assigned = 0;
  for (let i = 0; i < channels.length; i++) {
    const isLast = i === channels.length - 1;
    const share = isLast ? amount - assigned : (amount * weights[i]) / totalW;
    if (share !== 0) out.set(channels[i], (out.get(channels[i]) || 0) + share);
    assigned += share;
  }
  return out;
}

function parseCustom(raw) {
  if (!raw) return {};
  if (typeof raw === 'object') return raw;
  try {
    return JSON.parse(raw);
  } catch {
    throw new Error('allocation_custom não é JSON válido');
  }
}
