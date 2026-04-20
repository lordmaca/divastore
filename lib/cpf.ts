// Brazilian CPF validation. Used for NF-e emission (Tiny requires it) and
// profile editing. Returns the 11-digit string on success, null if invalid.

export function sanitizeCpf(raw: string): string {
  return raw.replace(/\D/g, "");
}

export function isValidCpf(raw: string): boolean {
  const digits = sanitizeCpf(raw);
  if (digits.length !== 11) return false;
  if (/^(\d)\1{10}$/.test(digits)) return false; // 000.000.000-00 etc.
  const nums = digits.split("").map(Number);
  for (let pos = 9; pos < 11; pos++) {
    let sum = 0;
    for (let i = 0; i < pos; i++) sum += nums[i] * (pos + 1 - i);
    const check = ((sum * 10) % 11) % 10;
    if (check !== nums[pos]) return false;
  }
  return true;
}

export function formatCpf(raw: string): string {
  const d = sanitizeCpf(raw);
  if (d.length !== 11) return raw;
  return `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}`;
}
