#!/usr/bin/env node
// CLI: restore finance.db from a backup. Usage:
//   npm run restore -- --list
//   npm run restore -- --file finance-2026-07-06T03-00-00.db
import fs from 'node:fs';
import path from 'node:path';
import { backupDir, dbPath } from '../src/paths.js';
import { closeDb } from '../src/db/index.js';

function argValue(flag) {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : null;
}

const backups = fs.existsSync(backupDir)
  ? fs.readdirSync(backupDir).filter((f) => f.startsWith('finance-') && f.endsWith('.db')).sort().reverse()
  : [];

if (process.argv.includes('--list') || (!argValue('--file') && !process.argv.includes('--latest'))) {
  console.log(`Backups disponíveis (${backups.length}) em ${backupDir}:`);
  backups.forEach((f) => console.log(`  ${f}`));
  console.log('\nRestaurar:  npm run restore -- --file <arquivo>   (ou --latest)');
  process.exit(0);
}

const chosen = process.argv.includes('--latest') ? backups[0] : argValue('--file');
if (!chosen) {
  console.error('Nenhum backup escolhido.');
  process.exit(1);
}
const src = path.join(backupDir, chosen);
if (!fs.existsSync(src)) {
  console.error(`Backup não encontrado: ${src}`);
  process.exit(1);
}

// Safety copy of the current db before overwriting.
closeDb();
if (fs.existsSync(dbPath)) fs.copyFileSync(dbPath, `${dbPath}.before-restore`);
fs.copyFileSync(src, dbPath);
console.log(`✅ Restaurado de ${chosen}. (cópia anterior em finance.db.before-restore)`);
