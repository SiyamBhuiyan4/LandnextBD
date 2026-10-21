/** Normalize a Bangladeshi mobile number to E.164 (+8801XXXXXXXXX), or null if invalid. */
export function normalizeBdPhone(input: string): string | null {
  const digits = input.replace(/[^\d+]/g, "");
  let local: string;
  if (digits.startsWith("+880")) local = digits.slice(4);
  else if (digits.startsWith("880")) local = digits.slice(3);
  else if (digits.startsWith("0")) local = digits.slice(1);
  else local = digits;
  return /^1[3-9]\d{8}$/.test(local) ? `+880${local}` : null;
}
