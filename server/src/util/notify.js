// Windows desktop toast via PowerShell NotifyIcon balloon — no dependency.
// Ported from the MDA Monitor pattern. No-op off Windows. Used for sync-failure
// alerts (S6.2).
import { spawn } from 'node:child_process';
import { log } from '../logger.js';

function psQuote(s) {
  return String(s == null ? '' : s).replace(/'/g, "''");
}

export function notifyDesktop({ title, text, level = 'danger' }) {
  if (process.platform !== 'win32') return;
  if (process.env.FINANCE_NO_TOAST) return;
  const icon = level === 'recovery' ? 'Info' : level === 'warn' ? 'Warning' : 'Error';
  const ps = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing
[System.Media.SystemSounds]::${level === 'recovery' ? 'Asterisk' : 'Exclamation'}.Play()
$n = New-Object System.Windows.Forms.NotifyIcon
$n.Icon = [System.Drawing.SystemIcons]::${icon}
$n.BalloonTipIcon = [System.Windows.Forms.ToolTipIcon]::${icon}
$n.BalloonTipTitle = '${psQuote(title)}'
$n.BalloonTipText = '${psQuote(text)}'
$n.Visible = $true
$n.ShowBalloonTip(9000)
Start-Sleep -Seconds 10
$n.Dispose()
`.trim();
  try {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-WindowStyle', 'Hidden', '-Command', ps], {
      detached: true,
      stdio: 'ignore',
    });
    child.on('error', (e) => log.warn(`toast falhou: ${e.message}`));
    child.unref();
  } catch (e) {
    log.warn(`toast falhou: ${e.message}`);
  }
}
