const fmt = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' });

/** Format integer cents to a display string, e.g. 58300 → "$583.00" */
export function formatMoney(cents: number): string {
  return fmt.format(cents / 100);
}
