// A date input that ALWAYS reads and writes in Brazilian format (dd/mm/aaaa),
// regardless of the browser/OS locale — the native <input type="date"> renders
// in the OS locale (often mm/dd/yyyy) which confuses BR users. This component
// keeps a masked text field as the source of truth (value in/out is ISO
// yyyy-mm-dd) and layers the native calendar picker behind a 📅 button.
import { useEffect, useRef, useState } from 'react';

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;

/** ISO yyyy-mm-dd → dd/mm/aaaa (empty string if not a full ISO date). */
export function isoToBR(iso: string): string {
  if (!iso || !ISO_RE.test(iso)) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

/** dd/mm/aaaa → ISO yyyy-mm-dd, or null if incomplete/invalid (rejects 31/02). */
export function brToIso(br: string): string | null {
  const m = br.trim().match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const iso = `${y}-${mo}-${d}`;
  const dt = new Date(`${iso}T00:00:00Z`);
  if (
    Number.isNaN(dt.getTime()) ||
    dt.getUTCFullYear() !== +y ||
    dt.getUTCMonth() + 1 !== +mo ||
    dt.getUTCDate() !== +d
  ) {
    return null;
  }
  return iso;
}

/** Progressive dd/mm/aaaa mask as the user types digits. */
function mask(input: string): string {
  const digits = input.replace(/\D/g, '').slice(0, 8);
  return [digits.slice(0, 2), digits.slice(2, 4), digits.slice(4, 8)].filter(Boolean).join('/');
}

interface Props {
  value: string; // ISO yyyy-mm-dd, or '' when empty
  onChange: (iso: string) => void;
  allowEmpty?: boolean;
  required?: boolean;
  ariaLabel?: string;
  className?: string;
  style?: React.CSSProperties;
}

export function DateField({ value, onChange, allowEmpty = false, required, ariaLabel, className = '', style }: Props) {
  const [text, setText] = useState(() => isoToBR(value));
  const nativeRef = useRef<HTMLInputElement>(null);

  // Re-sync when the value changes from outside (presets, reset, external set).
  useEffect(() => setText(isoToBR(value)), [value]);

  const invalid = text.trim() !== '' && brToIso(text) == null;

  function onText(raw: string) {
    const m = mask(raw);
    setText(m);
    if (m.trim() === '') {
      if (allowEmpty) onChange('');
      return;
    }
    const iso = brToIso(m);
    if (iso) onChange(iso);
  }

  function openPicker() {
    const el = nativeRef.current;
    if (!el) return;
    try {
      el.showPicker();
    } catch {
      el.focus();
    }
  }

  return (
    <div className={`relative inline-flex items-center ${className}`}>
      <input
        type="text"
        inputMode="numeric"
        aria-label={ariaLabel}
        aria-invalid={invalid || undefined}
        required={required}
        placeholder="dd/mm/aaaa"
        value={text}
        onChange={(e) => onText(e.target.value)}
        onBlur={() => setText(isoToBR(value))}
        className="w-full rounded-lg border bg-transparent py-1.5 pl-2.5 pr-8 text-sm tabular-nums"
        style={{ borderColor: invalid ? 'var(--neg)' : 'var(--border)', ...style }}
      />
      <button
        type="button"
        onClick={openPicker}
        aria-label="abrir calendário"
        className="absolute right-1 flex h-6 w-6 items-center justify-center rounded text-xs opacity-60 hover:opacity-100"
        style={{ color: 'var(--text-muted)' }}
      >
        📅
      </button>
      {/* Native picker kept in the layout (not display:none) so showPicker() works. */}
      <input
        ref={nativeRef}
        type="date"
        tabIndex={-1}
        aria-hidden="true"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="pointer-events-none absolute right-1 h-0 w-0 opacity-0"
      />
    </div>
  );
}
