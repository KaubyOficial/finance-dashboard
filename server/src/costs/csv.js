// CSV cost import (S3.3). Dry-run preview, per-line errors that don't abort the
// valid rows, de-dup by row hash (vs DB and within the file). Handles BOM,
// ';' vs ',' delimiter, and Brazilian decimal comma.
import { validateCost, costRowHash, createCost } from './service.js';

export const CSV_COLUMNS = [
  'kind',
  'category',
  'description',
  'amount',
  'currency',
  'channel_id',
  'allocation_rule',
  'allocation_custom',
  'start_date',
  'end_date',
];

function stripBom(s) {
  return s.charCodeAt(0) === 0xfeff ? s.slice(1) : s;
}

function detectDelimiter(headerLine) {
  return headerLine.includes(';') ? ';' : ',';
}

/** Split one CSV line honouring double-quoted fields. */
function splitLine(line, delim) {
  const out = [];
  let cur = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (ch === '"') {
        inQuotes = false;
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      inQuotes = true;
    } else if (ch === delim) {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out.map((f) => f.trim());
}

function parseAmount(raw, delim) {
  if (raw == null) return NaN;
  let s = String(raw).trim();
  // With ';' delimiter, decimals may use comma (BR): "1.234,56" or "40,00".
  if (delim === ';') {
    s = s.replace(/\./g, '').replace(',', '.');
  } else if (/,\d{1,2}$/.test(s) && !s.includes('.')) {
    s = s.replace(',', '.');
  }
  return Number(s);
}

function rowToCost(fields, header, delim) {
  const obj = {};
  header.forEach((h, i) => {
    obj[h] = fields[i] !== undefined ? fields[i] : '';
  });
  const channel_id = obj.channel_id && obj.channel_id.toLowerCase() !== 'shared' ? obj.channel_id : null;
  let allocation_custom = null;
  if (obj.allocation_custom) {
    try {
      allocation_custom = JSON.parse(obj.allocation_custom);
    } catch {
      throw new Error(`allocation_custom não é JSON: "${obj.allocation_custom}"`);
    }
  }
  return {
    kind: obj.kind,
    category: obj.category,
    description: obj.description || '',
    amount: parseAmount(obj.amount, delim),
    currency: (obj.currency || '').toUpperCase(),
    channel_id,
    allocation_rule: obj.allocation_rule || null,
    allocation_custom,
    start_date: obj.start_date,
    end_date: obj.end_date || null,
    source: 'csv',
  };
}

/**
 * Parse + validate CSV text against the DB (for de-dup). Never throws on a bad
 * line — collects it in `errors` and keeps going.
 * @returns { toInsert[], duplicates[], errors[{line,message}], delimiter }
 */
export function analyzeCsv(db, text) {
  const clean = stripBom(text).replace(/\r\n/g, '\n').trim();
  const lines = clean.split('\n').filter((l) => l.trim() !== '');
  if (lines.length === 0) return { toInsert: [], duplicates: [], errors: [{ line: 0, message: 'arquivo vazio' }], delimiter: ',' };

  const delim = detectDelimiter(lines[0]);
  const header = splitLine(lines[0], delim).map((h) => h.toLowerCase());
  const existingHashes = new Set(db.prepare('SELECT row_hash FROM costs WHERE row_hash IS NOT NULL').all().map((r) => r.row_hash));
  const seen = new Set();

  const toInsert = [];
  const duplicates = [];
  const errors = [];

  for (let i = 1; i < lines.length; i++) {
    const lineNo = i + 1; // 1-based, header is line 1
    try {
      const fields = splitLine(lines[i], delim);
      const draft = rowToCost(fields, header, delim);
      const cost = validateCost(draft);
      const hash = costRowHash(cost);
      if (existingHashes.has(hash) || seen.has(hash)) {
        duplicates.push({ line: lineNo, cost, hash });
      } else {
        seen.add(hash);
        toInsert.push({ line: lineNo, cost, hash });
      }
    } catch (e) {
      errors.push({ line: lineNo, message: e.message });
    }
  }
  return { toInsert, duplicates, errors, delimiter: delim };
}

/** Import (or dry-run) a CSV. On commit, inserts only the non-duplicate rows. */
export function importCsv(db, text, { dryRun = true } = {}) {
  const analysis = analyzeCsv(db, text);
  if (dryRun) return { ...analysis, inserted: 0, dryRun: true };
  let inserted = 0;
  const tx = db.transaction(() => {
    for (const { cost } of analysis.toInsert) {
      createCost(db, cost);
      inserted++;
    }
  });
  tx();
  return { ...analysis, inserted, dryRun: false };
}
