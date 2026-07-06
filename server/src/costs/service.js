// Cost CRUD + validation (S3.1). Recurring (monthly, with start/end) or one-off.
import crypto from 'node:crypto';
import { z } from 'zod';
import { isValidDate } from '../util/dates.js';

export const COST_CURRENCIES = ['USD', 'BRL', 'EUR'];
export const ALLOCATION_RULES = ['equal', 'by_revenue', 'custom'];

const base = z.object({
  kind: z.enum(['recurring', 'one_off']),
  category: z.string().min(1, 'categoria obrigatória'),
  description: z.string().optional().default(''),
  amount: z.number().positive('valor deve ser > 0'),
  currency: z.enum(COST_CURRENCIES),
  channel_id: z.string().nullable().optional().default(null),
  allocation_rule: z.enum(ALLOCATION_RULES).nullable().optional().default(null),
  allocation_custom: z.record(z.string(), z.number()).nullable().optional().default(null),
  start_date: z.string().refine(isValidDate, 'start_date inválida (YYYY-MM-DD)'),
  end_date: z.string().refine(isValidDate, 'end_date inválida').nullable().optional().default(null),
  source: z.enum(['manual', 'csv']).optional().default('manual'),
});

const costSchema = base.superRefine((c, ctx) => {
  if (c.kind === 'recurring' && c.end_date && c.end_date < c.start_date) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'end_date não pode ser antes de start_date' });
  }
  if (c.kind === 'one_off' && c.end_date) {
    ctx.addIssue({ code: 'custom', path: ['end_date'], message: 'custo avulso não tem end_date' });
  }
  const shared = !c.channel_id;
  if (shared) {
    if (!c.allocation_rule) {
      ctx.addIssue({ code: 'custom', path: ['allocation_rule'], message: 'custo compartilhado precisa de allocation_rule' });
    }
    if (c.allocation_rule === 'custom') {
      const sum = Object.values(c.allocation_custom || {}).reduce((a, b) => a + b, 0);
      if (Math.abs(sum - 100) > 0.01) {
        ctx.addIssue({ code: 'custom', path: ['allocation_custom'], message: `percentuais devem somar 100% (soma=${sum})` });
      }
    }
  } else if (c.allocation_rule) {
    ctx.addIssue({ code: 'custom', path: ['allocation_rule'], message: 'custo com canal não usa allocation_rule' });
  }
});

export function validateCost(input) {
  const r = costSchema.safeParse(input);
  if (!r.success) {
    const msg = r.error.issues.map((i) => `${i.path.join('.') || '(raiz)'}: ${i.message}`).join('; ');
    throw Object.assign(new Error(msg), { status: 400 });
  }
  return r.data;
}

/** Stable hash for CSV de-dup: identical business content = same hash (S3.3). */
export function costRowHash(c) {
  const norm = [c.kind, c.category, c.amount, c.currency, c.channel_id || 'shared', c.allocation_rule || '', c.start_date, c.end_date || ''].join('|');
  return crypto.createHash('sha1').update(norm).digest('hex');
}

export function createCost(db, input) {
  const c = validateCost(input);
  const row_hash = costRowHash(c);
  const info = db
    .prepare(`INSERT INTO costs
      (kind, category, description, amount, currency, channel_id, allocation_rule, allocation_custom, start_date, end_date, source, row_hash)
      VALUES (@kind, @category, @description, @amount, @currency, @channel_id, @allocation_rule, @allocation_custom, @start_date, @end_date, @source, @row_hash)`)
    .run({
      ...c,
      allocation_custom: c.allocation_custom ? JSON.stringify(c.allocation_custom) : null,
      row_hash,
    });
  return getCost(db, info.lastInsertRowid);
}

export function getCost(db, id) {
  const row = db.prepare('SELECT * FROM costs WHERE id = ?').get(id);
  return row ? hydrate(row) : null;
}

export function updateCost(db, id, input) {
  const existing = getCost(db, id);
  if (!existing) throw Object.assign(new Error('custo não encontrado'), { status: 404 });
  const merged = { ...existing, ...input };
  const c = validateCost(merged);
  db.prepare(`UPDATE costs SET
      kind=@kind, category=@category, description=@description, amount=@amount, currency=@currency,
      channel_id=@channel_id, allocation_rule=@allocation_rule, allocation_custom=@allocation_custom,
      start_date=@start_date, end_date=@end_date, row_hash=@row_hash, updated_at=datetime('now')
      WHERE id=@id`)
    .run({
      ...c,
      id,
      allocation_custom: c.allocation_custom ? JSON.stringify(c.allocation_custom) : null,
      row_hash: costRowHash(c),
    });
  return getCost(db, id);
}

export function deleteCost(db, id) {
  const info = db.prepare('DELETE FROM costs WHERE id = ?').run(id);
  return info.changes > 0;
}

export function listCosts(db, { channel_id, category, month } = {}) {
  let sql = 'SELECT * FROM costs WHERE 1=1';
  const args = [];
  if (channel_id === 'shared') sql += ' AND channel_id IS NULL';
  else if (channel_id) {
    sql += ' AND channel_id = ?';
    args.push(channel_id);
  }
  if (category) {
    sql += ' AND category = ?';
    args.push(category);
  }
  if (month) {
    // recurring covering the month, or one_off in the month
    sql += ` AND (
      (kind='one_off' AND substr(start_date,1,7)=?) OR
      (kind='recurring' AND substr(start_date,1,7)<=? AND (end_date IS NULL OR substr(end_date,1,7)>=?))
    )`;
    args.push(month, month, month);
  }
  sql += ' ORDER BY start_date DESC, id DESC';
  return db.prepare(sql).all(...args).map(hydrate);
}

function hydrate(row) {
  return { ...row, allocation_custom: row.allocation_custom ? JSON.parse(row.allocation_custom) : null };
}
