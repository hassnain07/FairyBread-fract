export class AppError extends Error {
  constructor(
    public code: string,
    message: string,
    public cause?: unknown
  ) {
    super(message);
  }
}

const COPY: Record<string, string> = {
  not_authenticated: 'Please sign in again.',
  forbidden: "You don't have permission to do that.",
  child_not_found: "We couldn't find that child.",
  child_not_enrolled: 'Please complete enrolment for this child first.',
  session_unavailable: 'That class is no longer available.',
  session_started: 'That class has already started.',
  session_outside_term: 'That class falls after your term ends. You can book it as an individual class.',
  no_term_ever: 'Purchase a term to unlock class bookings.',
  term_expired: 'Your term has ended. Renew to book with credits.',
  no_credits: "You've used all your credits for this term.",
  class_full: 'Sorry, that class just filled up. You can join the waiting list.',
  already_booked: 'This child is already booked into that class.',
  booking_not_found: "We couldn't find that booking.",
  already_cancelled: 'This booking was already cancelled.',
  payment_not_found: "We couldn't find that payment.",
  payment_not_pending: 'That payment has already been reviewed.',
  proof_missing: 'Please attach your proof of payment and try again.',
  consent_required: 'Please agree to all three documents to continue.',
  signature_required: 'Please type your full name as a signature.',
  seat_unavailable: 'That seat is no longer available — please contact the family.',
  class_has_bookings: 'This class has upcoming bookings. Cancel the sessions first.',
  invalid_input: 'Some of the details look wrong. Please check and try again.',
  invalid_message: 'Messages must be between 1 and 4000 characters.',
  // shop
  out_of_stock: 'Sorry — one or more items just sold out. Please review your cart.',
  product_unavailable: 'One of the items in your cart is no longer available.',
  payment_method_disabled: "That payment method isn't available right now.",
  guest_checkout_disabled: 'Guest checkout is currently unavailable. Please sign in to order.',
  captcha_failed: "We couldn't verify you're human. Please try again.",
  order_not_found: "We couldn't find that order.",
  invalid_transition: "That status change isn't allowed from the current status.",
  payment_required: 'Verify the payment before moving this order to Processing.',
  // auth / OTP
  otp_invalid: 'That code is incorrect or has expired. Check it, or request a new one.',
  rate_limited: 'Too many attempts. Please wait a minute and try again.',
  weak_password: 'Please choose a stronger password (at least 8 characters).',
};

export function toAppError(e: unknown): AppError {
  const err = e as { message?: string; code?: string; status?: number };
  const msg = err?.message ?? '';

  if (COPY[msg]) return new AppError(msg, COPY[msg], e);
  if (err?.code === '42501' || err?.status === 403)
    return new AppError('forbidden', COPY.forbidden, e);
  if (err?.code === '23505')
    return new AppError('duplicate', 'That already exists.', e);
  if (/Invalid login credentials/i.test(msg))
    return new AppError('bad_login', 'Incorrect email or password. Please try again.', e);
  if (/Token has expired or is invalid|otp_expired|invalid.*(token|otp)/i.test(msg))
    return new AppError('otp_invalid', COPY.otp_invalid, e);
  if (
    /rate limit|over_email_send_rate_limit|only request this after|too many requests/i.test(msg) ||
    err?.status === 429
  )
    return new AppError('rate_limited', COPY.rate_limited, e);
  if (/Password should be|weak.password/i.test(msg))
    return new AppError('weak_password', COPY.weak_password, e);
  if (/Failed to fetch|NetworkError|network/i.test(msg))
    return new AppError(
      'network',
      "We can't reach the server. Check your connection and try again.",
      e
    );

  console.error('[data]', e);
  return new AppError('unknown', 'Something went wrong. Please try again.', e);
}
