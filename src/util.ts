// Display-width helpers (lite wcwidth) — correct column alignment without a dep.
function charWidth(cp: number): number {
  if (cp === 0) return 0;
  if (cp < 32 || (cp >= 0x7f && cp < 0xa0)) return 0;                 // control
  if ((cp >= 0x300 && cp <= 0x36f) || cp === 0x200b || cp === 0xfe0f) return 0; // combining / ZWSP / VS16
  if (
    (cp >= 0x1100 && cp <= 0x115f) || (cp >= 0x2e80 && cp <= 0xa4cf) ||
    (cp >= 0xac00 && cp <= 0xd7a3) || (cp >= 0xf900 && cp <= 0xfaff) ||
    (cp >= 0xfe30 && cp <= 0xfe4f) || (cp >= 0xff00 && cp <= 0xff60) ||
    (cp >= 0xffe0 && cp <= 0xffe6) || (cp >= 0x1f000 && cp <= 0x1faff) ||
    (cp >= 0x2600 && cp <= 0x27bf)
  ) return 2;                                                         // CJK / fullwidth / emoji
  return 1;
}
export function dwidth(s: string): number { let w = 0; for (const ch of s) w += charWidth(ch.codePointAt(0)!); return w; }
export function dtrunc(s: string, n: number): string {
  if (dwidth(s) <= n) return s;
  let w = 0, r = '';
  for (const ch of s) { const c = charWidth(ch.codePointAt(0)!); if (w + c > n - 1) return r + '…'; w += c; r += ch; }
  return r;
}
export function dpad(s: string, n: number): string { const t = dtrunc(s, n); return t + ' '.repeat(Math.max(0, n - dwidth(t))); }
export const stripAnsi = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '');
