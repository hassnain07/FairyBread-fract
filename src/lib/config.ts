/**
 * Pricing constants — all unconfirmed with client.
 * Change here only; never hardcode these values in components or data.
 */

// TODO: confirm with client — assumed $50 (i.e. $500 ÷ 10). May differ.
export const INDIVIDUAL_CLASS_PRICE = 50;

// TODO: confirm with client — assumed charged on every term renewal, not first signup only.
export const TERM_BASE_PRICE = 500;
export const REGISTRATION_FEE = 30;
export const GST_RATE = 0.1;

/** Total a family pays per term: base + registration + GST on both */
export const TERM_TOTAL = (TERM_BASE_PRICE + REGISTRATION_FEE) * (1 + GST_RATE);

// TODO: confirm with client — teacher-set class price is treated as internal/admin + payroll only.
// It does NOT affect what a parent pays during term-credit booking (always 1 credit).
// Only surface to admin/teacher views and the individual class purchase flow.
export const TEACHER_PRICE_IS_PARENT_FACING = false;

/** Number of credits included in one term — stored, not hardcoded in UI logic. */
export const TERM_CREDITS = 10;

/** Weeks in a term — the calendar clock, not the credit clock. */
export const TERM_WEEKS = 10;

/** Warn parents when this many weeks remain before term end. */
export const TERM_EXPIRY_WARNING_WEEKS = 2;
