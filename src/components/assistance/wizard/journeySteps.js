// The single, honest milestone list for the customer financing journey. Only
// milestones the customer can actually reach are shown; each label says what
// really happens at that point.
export const MILESTONES = [
  { id: "plan", label: "Your plan", caption: "Package and deposit" },
  { id: "terms", label: "Monthly plan", caption: "Pick your payments" },
  { id: "applicant", label: "Your details", caption: "Contact and income" },
  { id: "review", label: "Review", caption: "Submit application" },
  { id: "identity", label: "Identity", caption: "Secure ID check" },
  { id: "underwriting", label: "Elite review", caption: "Hands-on approval" },
  { id: "agreement", label: "Sign terms", caption: "Agreement and disclosures" },
  { id: "deposit", label: "Deposit", caption: "Pay and activate" },
];

export const milestone = (id) => MILESTONES.find((entry) => entry.id === id) || { id, label: id, caption: "" };