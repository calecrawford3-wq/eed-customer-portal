// Offer expiration dates are stored as plain calendar dates. Accept either a
// bare date or a full timestamp without producing an Invalid Date in the UI.
export function parseOfferDate(value) {
  if (!value) return null;
  const text = String(value);
  const date = new Date(text.length > 10 ? text : `${text}T12:00:00`);
  return Number.isNaN(date.getTime()) ? null : date;
}