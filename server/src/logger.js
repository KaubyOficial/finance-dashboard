// Tiny leveled logger. Writes to stdout and, when a run context is set, appends
// the same lines to a per-run file under data/sync-log/ (Epic 6 · S6.1).
import fs from 'node:fs';

let fileStream = null;

function ts() {
  // ISO without milliseconds; local time is fine for human-facing logs.
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function write(level, args) {
  const line = `[${ts()}] ${level.toUpperCase()} ${args
    .map((a) => (typeof a === 'string' ? a : JSON.stringify(a)))
    .join(' ')}`;
  const stream = level === 'error' || level === 'warn' ? process.stderr : process.stdout;
  stream.write(line + '\n');
  if (fileStream) {
    try {
      fileStream.write(line + '\n');
    } catch {
      /* file logging is best-effort */
    }
  }
}

export const log = {
  info: (...a) => write('info', a),
  warn: (...a) => write('warn', a),
  error: (...a) => write('error', a),
  debug: (...a) => {
    if (process.env.FINANCE_DEBUG) write('debug', a);
  },
};

/** Attach a file sink (used by the headless sync so cron runs leave a trail). */
export function attachLogFile(filePath) {
  detachLogFile();
  fileStream = fs.createWriteStream(filePath, { flags: 'a' });
}

export function detachLogFile() {
  if (fileStream) {
    fileStream.end();
    fileStream = null;
  }
}
