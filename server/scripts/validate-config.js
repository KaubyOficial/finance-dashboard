#!/usr/bin/env node
// CLI: validate config/channels.json. Exit 1 on structural errors; pending
// placeholders are warnings (exit 0) so the template passes but nags.
import { validateChannelsConfig } from '../src/config/channels.js';

const r = validateChannelsConfig();

if (r.errors.length) {
  console.error(`\n❌ ${r.errors.length} erro(s) de configuração:`);
  for (const e of r.errors) console.error(`   • ${e}`);
}
if (r.warnings.length) {
  console.warn(`\n⚠️  ${r.warnings.length} pendência(s) (não bloqueiam, mas preencher antes do sync):`);
  for (const w of r.warnings) console.warn(`   • ${w}`);
}
if (r.ok) {
  console.log(`\n✅ config/channels.json válido — ${r.count} canais.${r.warnings.length ? ' (com pendências acima)' : ''}`);
  process.exit(0);
}
process.exit(1);
