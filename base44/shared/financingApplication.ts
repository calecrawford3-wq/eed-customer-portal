// Customer financing application for Elite in-house financing.
// Everything here is validated on the server. No Social Security number, ID
// number or document is ever accepted or stored: if a provider requires an SSN
// the customer types it only on the provider's own hosted page.

export const APPLICATION_CONSENT_VERSION = '2026-11-16';

export const APPLICATION_CONSENT_TEXT =
  'I certify that the information on this financing application is true and complete. I understand that Elite Engine Development reviews it by hand, '
  + 'that this is not a credit report and Elite does not obtain a credit score from it, and that no Social Security number is collected on this page. '
  + 'I understand nothing is owed unless Elite approves the terms and I sign the Retail Installment Agreement.';

export const EMPLOYMENT_STATUSES = [
  'employed_full_time',
  'employed_part_time',
  'self_employed',
  'retired',
  'student',
  'unemployed',
  'other',
];

export const EMPLOYMENT_LABELS: Record<string, string> = {
  employed_full_time: 'Employed full time',
  employed_part_time: 'Employed part time',
  self_employed: 'Self-employed',
  retired: 'Retired',
  student: 'Student',
  unemployed: 'Not currently employed',
  other: 'Other',
};

export function minAgeDate(years: number, from = new Date()) {
  const d = new Date(Date.UTC(from.getUTCFullYear() - years, from.getUTCMonth(), from.getUTCDate()));
  return d.toISOString().slice(0, 10);
}

// Returns { ok, error } or { ok, application }. Only an allowlisted set of
// fields is kept, so a caller cannot smuggle extra data onto the record.
export function validateFinancingApplication(input: any) {
  const text = (value: any, max = 120) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);
  const errors: string[] = [];

  const legalName = text(input?.legal_name, 120);
  if (legalName.length < 2) errors.push('Enter your full legal name.');

  const line1 = text(input?.address_line1, 120);
  if (line1.length < 3) errors.push('Enter your street address.');

  const city = text(input?.city, 80);
  if (city.length < 2) errors.push('Enter your city.');

  const state = text(input?.state, 2).toUpperCase();
  if (!/^[A-Z]{2}$/.test(state)) errors.push('Enter your two-letter state code.');

  const postal = text(input?.postal_code, 10);
  if (!/^\d{5}(-\d{4})?$/.test(postal)) errors.push('Enter a valid ZIP code.');

  const dob = text(input?.date_of_birth, 10);
  const dobDate = new Date(`${dob}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dob) || !Number.isFinite(dobDate.getTime())) {
    errors.push('Enter your date of birth.');
  } else if (dob > minAgeDate(18)) {
    errors.push('You must be at least 18 years old to apply for in-house financing.');
  } else if (dob < minAgeDate(120)) {
    errors.push('Check the date of birth you entered.');
  }

  const employmentStatus = EMPLOYMENT_STATUSES.includes(String(input?.employment_status))
    ? String(input?.employment_status)
    : '';
  if (!employmentStatus) errors.push('Choose your employment status.');

  const income = Number(input?.monthly_income);
  if (!Number.isFinite(income) || income < 0 || income > 1000000) {
    errors.push('Enter your monthly income as a number.');
  }

  if (input?.consent !== true) {
    errors.push('You must certify the information and agree to Elite reviewing your application.');
  }

  if (errors.length) return { ok: false as const, error: errors[0] };

  return {
    ok: true as const,
    application: {
      legal_name: legalName,
      signature_name: legalName,
      address_line1: line1,
      address_line2: text(input?.address_line2, 120),
      city,
      state,
      postal_code: postal,
      country: 'US',
      date_of_birth: dob,
      employment_status: employmentStatus,
      employer_name: text(input?.employer_name, 120),
      monthly_income: Math.round(income * 100) / 100,
      income_period: 'monthly',
      consent: true,
      consent_version: APPLICATION_CONSENT_VERSION,
      consent_text: APPLICATION_CONSENT_TEXT,
      submitted_at: new Date().toISOString(),
    },
  };
}

// Customer-facing summary. The date of birth, address lines and consent text
// stay on the record and are visible to staff only.
export function publicApplicationSummary(application: any) {
  if (!application) return null;
  return {
    legal_name: application.legal_name || '',
    city: application.city || '',
    state: application.state || '',
    employment_status: application.employment_status || '',
    employment_label: EMPLOYMENT_LABELS[application.employment_status] || '',
    monthly_income: Math.round((Number(application.monthly_income) || 0) * 100) / 100,
    submitted_at: application.submitted_at || '',
    consent_version: application.consent_version || '',
  };
}