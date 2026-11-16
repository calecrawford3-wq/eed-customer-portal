// Customer-facing copy for the financing application. The server keeps its own
// authoritative copy (base44/shared/financingApplication.ts) and re-validates
// every field; this file only labels the form.
export const APPLICATION_CONSENT_TEXT =
  'I certify that the information on this financing application is true and complete. I understand that Elite Engine Development reviews it by hand, '
  + 'that this is not a credit report and Elite does not obtain a credit score from it, and that no Social Security number is collected on this page. '
  + 'I understand nothing is owed unless Elite approves the terms and I sign the Retail Installment Agreement.';

export const EMPLOYMENT_OPTIONS = [
  { value: 'employed_full_time', label: 'Employed full time' },
  { value: 'employed_part_time', label: 'Employed part time' },
  { value: 'self_employed', label: 'Self-employed' },
  { value: 'retired', label: 'Retired' },
  { value: 'student', label: 'Student' },
  { value: 'unemployed', label: 'Not currently employed' },
  { value: 'other', label: 'Other' },
];

export const EMPLOYMENT_LABELS = Object.fromEntries(EMPLOYMENT_OPTIONS.map((option) => [option.value, option.label]));