// Loads and validates config/channels.json, and mirrors it into the `channels`
// table. Distinguishes STRUCTURAL errors (break the file) from PENDING
// placeholders (empty youtube_channel_id / google_account) — the latter are
// warnings so the template is usable before Kauê fills the real IDs (S0.5).
import fs from 'node:fs';
import { z } from 'zod';
import { channelsConfigPath } from '../paths.js';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const CURRENCIES = ['USD', 'BRL', 'EUR'];

const channelSchema = z.object({
  id: z
    .string()
    .regex(/^[a-z0-9_]+$/, 'id deve ser snake_case (a-z, 0-9, _)'),
  name: z.string().min(1),
  youtube_channel_id: z.string().default(''),
  google_account: z.string().default(''),
  src_prefixes: z.array(z.string().min(1)).min(1, 'ao menos 1 src_prefix'),
  launch_date: z.string().regex(ISO_DATE, 'launch_date deve ser YYYY-MM-DD'),
  reference_currency: z.enum(CURRENCIES).default('USD'),
});

const fileSchema = z.object({
  version: z.number().int().positive(),
  channels: z.array(channelSchema).min(1),
});

/** Read + parse the raw config file. Throws with a clear message on hard errors. */
export function loadChannelsConfig(filePath = channelsConfigPath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`config/channels.json não encontrado em ${filePath}`);
  }
  let json;
  try {
    json = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (e) {
    throw new Error(`config/channels.json não é JSON válido: ${e.message}`);
  }
  const parsed = fileSchema.safeParse(json);
  if (!parsed.success) {
    const issues = parsed.error.issues
      .map((i) => `  • channels${i.path.length ? '.' + i.path.join('.') : ''}: ${i.message}`)
      .join('\n');
    throw new Error(`config/channels.json inválido:\n${issues}`);
  }
  return parsed.data;
}

/**
 * Validate for the CLI: returns { ok, errors[], warnings[] }.
 * errors = structural problems (duplicate id, src-prefix collision).
 * warnings = pending placeholders that don't break the schema.
 */
export function validateChannelsConfig(filePath = channelsConfigPath) {
  const errors = [];
  const warnings = [];
  let cfg;
  try {
    cfg = loadChannelsConfig(filePath);
  } catch (e) {
    return { ok: false, errors: [e.message], warnings: [] };
  }

  const seenIds = new Set();
  const prefixOwner = new Map(); // lowercased prefix -> channel id
  for (const ch of cfg.channels) {
    if (seenIds.has(ch.id)) errors.push(`id duplicado: "${ch.id}"`);
    seenIds.add(ch.id);

    for (const raw of ch.src_prefixes) {
      const p = raw.toLowerCase();
      if (prefixOwner.has(p) && prefixOwner.get(p) !== ch.id) {
        errors.push(
          `colisão de src_prefix "${raw}" entre "${prefixOwner.get(p)}" e "${ch.id}" (atribuição ambígua)`
        );
      }
      prefixOwner.set(p, ch.id);
    }

    if (!ch.youtube_channel_id) warnings.push(`canal "${ch.id}": youtube_channel_id PENDENTE`);
    else if (!/^UC[\w-]{20,}$/.test(ch.youtube_channel_id))
      errors.push(`canal "${ch.id}": youtube_channel_id "${ch.youtube_channel_id}" não parece um UC...`);

    if (!ch.google_account) warnings.push(`canal "${ch.id}": google_account PENDENTE`);
  }

  return { ok: errors.length === 0, errors, warnings, count: cfg.channels.length };
}

/** In-memory view used by sync/engine. */
export function getConfigChannels(filePath = channelsConfigPath) {
  return loadChannelsConfig(filePath).channels;
}

/**
 * Build a case-insensitive prefix → channelId resolver for attribution.
 * Longest prefix wins (so `yt_redef_de_video123` beats `yt_redef_de`).
 */
export function buildAttributionResolver(channels) {
  const entries = [];
  for (const ch of channels) {
    for (const p of ch.src_prefixes) entries.push([p.toLowerCase(), ch.id]);
  }
  entries.sort((a, b) => b[0].length - a[0].length);
  return function resolve(src) {
    if (!src) return null;
    const s = String(src).toLowerCase();
    for (const [prefix, id] of entries) {
      if (s.startsWith(prefix)) return id;
    }
    return null;
  };
}

/** Upsert config channels into the DB. Preserves runtime flags (monetized). */
export function syncChannelsFromConfig(db, filePath = channelsConfigPath) {
  const channels = getConfigChannels(filePath);
  const existing = new Set(db.prepare('SELECT id FROM channels').all().map((r) => r.id));
  const upsert = db.prepare(`
    INSERT INTO channels (id, name, youtube_channel_id, google_account, launch_date, reference_currency, updated_at)
    VALUES (@id, @name, @youtube_channel_id, @google_account, @launch_date, @reference_currency, datetime('now'))
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      youtube_channel_id = excluded.youtube_channel_id,
      google_account = excluded.google_account,
      launch_date = excluded.launch_date,
      reference_currency = excluded.reference_currency,
      updated_at = datetime('now')
  `);
  let added = 0;
  let updated = 0;
  const tx = db.transaction(() => {
    for (const ch of channels) {
      upsert.run({
        id: ch.id,
        name: ch.name,
        youtube_channel_id: ch.youtube_channel_id || null,
        google_account: ch.google_account || null,
        launch_date: ch.launch_date,
        reference_currency: ch.reference_currency,
      });
      if (existing.has(ch.id)) updated++;
      else added++;
    }
  });
  tx();
  return { added, updated };
}
