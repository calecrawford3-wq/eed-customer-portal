// Presentation metadata for the isolated assistance walkthrough.
// The server owns the step order; this list only labels it for the screen.
export const TEST_OFFER_NUMBER = "EAO-2026-1002";
export const DEMO_BANNER = "TEST MODE — NO REAL PAYMENT OR ID VERIFICATION";
export const DEMO_WATERMARK = "TEST ONLY — NOT LEGALLY BINDING";

export const DEMO_STEPS = [
  { key: "plan", label: "Deposit plan", short: "Plan" },
  { key: "identity", label: "Identity check (simulated)", short: "Identity" },
  { key: "financing", label: "In-house application", short: "Financing" },
  { key: "approval", label: "Elite review (simulated)", short: "Review" },
  { key: "agreement", label: "Installment agreement (test)", short: "Agreement" },
  { key: "autopay", label: "Autopay (sample)", short: "Autopay" },
  { key: "deposit", label: "Deposit (simulated)", short: "Deposit" },
  { key: "dashboard", label: "Loan dashboard (sample)", short: "Dashboard" },
];

export function stepIndex(key) {
  return DEMO_STEPS.findIndex((step) => step.key === key);
}

export function stepLabel(key) {
  return DEMO_STEPS.find((step) => step.key === key)?.label || key;
}

export function isDone(demo, key) {
  return Array.isArray(demo?.completed_steps) && demo.completed_steps.includes(key);
}

// A tester may look back at anything already reached, and may open the one new
// step the server has unlocked. Later steps stay locked.
export function canOpen(demo, key) {
  if (!demo) return false;
  if (isDone(demo, key)) return true;
  return demo.current_step === key && !isDone(demo, key);
}