// Applicant fields and validation shared by the details step and the review
// step. Only allowlisted fields the server accepts are collected here; no
// Social Security number, ID number or document is ever asked for.
export const EMPTY_APPLICANT = {
  legal_name: "",
  address_line1: "",
  address_line2: "",
  city: "",
  state: "",
  postal_code: "",
  date_of_birth: "",
  employment_status: "",
  employer_name: "",
  monthly_income: "",
};

export function validateApplicant(form) {
  const errors = {};
  const value = form || {};
  if (String(value.legal_name || "").trim().length < 2) errors.legal_name = "Enter your full legal name.";
  if (String(value.address_line1 || "").trim().length < 3) errors.address_line1 = "Enter your street address.";
  if (String(value.city || "").trim().length < 2) errors.city = "Enter your city.";
  if (!/^[A-Za-z]{2}$/.test(String(value.state || "").trim())) errors.state = "Use the two-letter state code.";
  if (!/^\d{5}(-\d{4})?$/.test(String(value.postal_code || "").trim())) errors.postal_code = "Enter a 5-digit ZIP code.";
  if (!value.date_of_birth) errors.date_of_birth = "Enter your date of birth.";
  if (!value.employment_status) errors.employment_status = "Choose your employment status.";
  const income = value.monthly_income;
  if (income === "" || income === null || income === undefined) errors.monthly_income = "Enter your monthly income.";
  else if (!(Number(income) >= 0)) errors.monthly_income = "Enter a number, for example 3200.";
  return { ok: Object.keys(errors).length === 0, errors };
}

export const draftKey = (token) => `eed-assist-draft-${token || "offer"}`;