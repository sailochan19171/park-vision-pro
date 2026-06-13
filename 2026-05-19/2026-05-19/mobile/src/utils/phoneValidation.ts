// Phone number helpers — single source of truth for the format we accept
// across the app (LoginScreen has its own historical version; new screens
// should use these to stay consistent).

/**
 * Strip everything that isn't a digit, then cap at 10. Use this inside
 * `onChangeText` so the user can only type a valid 10-digit value.
 *
 *     onChangeText={(v) => setPhone(normalizePhone(v))}
 *     // remember to also set maxLength={10}
 */
export function normalizePhone(input: string): string {
  return input.replace(/\D/g, '').slice(0, 10);
}

/**
 * True if the value is exactly 10 digits and starts with a valid Indian
 * mobile prefix (6/7/8/9). Empty strings return false — caller decides
 * whether the field is required.
 */
export function isValidPhone(input: string): boolean {
  return /^[6-9]\d{9}$/.test(input.trim());
}

/**
 * Convenience for forms where the phone is optional. Returns true when
 * the input is either empty or a valid 10-digit number.
 */
export function isValidOptionalPhone(input: string): boolean {
  const v = (input ?? '').trim();
  if (v === '') return true;
  return isValidPhone(v);
}

export const PHONE_VALIDATION_MESSAGE =
  'Please enter a valid 10-digit phone number starting with 6, 7, 8 or 9.';
