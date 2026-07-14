function pad(n) { return String(n).padStart(2, "0"); }

export function dateToStr(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
export function todayStr() { return dateToStr(new Date()); }
export function addDaysStr(dateStr, n) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + n);
  return dateToStr(d);
}
export function daysOverdue(dueDate) {
  return Math.floor((new Date(todayStr() + "T00:00:00").getTime() - new Date(dueDate + "T00:00:00").getTime()) / 86400000);
}

export const WEEKDAY_OPTIONS = ["Mon", "Tue", "Wed", "Thu", "Fri"];
export const CONTACT_TIME_OPTIONS = ["Morning", "Afternoon", "Evening", "Any time"];

export function isWeekend(dateStr) {
  const dow = new Date(dateStr + "T00:00:00").getDay();
  return dow === 0 || dow === 6;
}
export function nextWeekdayStr(dateStr) {
  if (!dateStr) return dateStr;
  const d = new Date(dateStr + "T00:00:00");
  const dow = d.getDay();
  if (dow === 6) d.setDate(d.getDate() + 2);
  else if (dow === 0) d.setDate(d.getDate() + 1);
  return dateToStr(d);
}

export const TIMEFRAME_LABELS = {
  "3_5_days": "3-5 Day Follow-up",
  "2_weeks": "2 Week Follow-up",
  "1_month": "1 Month Follow-up",
  "3_months": "3 Month Follow-up",
  "6_months": "6 Month Follow-up",
  "9_months": "9 Month Follow-up",
  "12_months": "12 Month Follow-up",
  "custom": "Custom Follow-up",
};

export const CHECKLISTS_BY_TIMEFRAME = {
  "3_5_days": [
    "Asked how the engine is running",
    "Asked about any break-in issues",
    "Confirmed oil change schedule",
    "Shared break-in tips",
    "Asked if they have any questions",
  ],
  "2_weeks": [
    "Asked how engine is performing",
    "Asked about temperatures",
    "Asked about any concerns",
    "Confirmed break-in complete",
    "Asked if they need tuning help",
  ],
  "1_month": [
    "Asked how the season is going",
    "Asked how engine is performing",
    "Asked about temperatures",
    "Asked about reliability",
    "Asked if they need tuning help",
    "Shared maintenance tip",
    "Asked if there is anything Elite can help with",
  ],
  "3_months": [
    "Asked about race results",
    "Asked about engine performance",
    "Asked about reliability",
    "Asked about maintenance done",
    "Discussed refresh timing",
    "Asked about referrals",
  ],
  "6_months": [
    "Asked how the season is going",
    "Asked about engine performance",
    "Asked about reliability issues",
    "Discussed refresh scheduling",
    "Asked about upcoming plans",
    "Asked about referrals",
  ],
  "9_months": [
    "Asked about season wrap-up",
    "Asked about engine condition",
    "Discussed off-season plans",
    "Discussed refresh scheduling",
    "Asked about next season goals",
    "Asked about referrals",
  ],
  "12_months": [
    "Annual review of engine performance",
    "Discussed refresh options",
    "Asked about next season plans",
    "Asked about upgrades",
    "Asked about referrals",
    "Scheduled next steps",
  ],
  "custom": [
    "Asked how things are going",
    "Addressed customer concerns",
    "Asked if they need anything",
    "Asked about referrals",
  ],
};

export const SATISFACTION_OPTIONS = [
  { value: "excellent", label: "Excellent", color: "bg-emerald-100 text-emerald-700 border-emerald-300" },
  { value: "good", label: "Good", color: "bg-blue-100 text-blue-700 border-blue-300" },
  { value: "needs_attention", label: "Needs Attention", color: "bg-amber-100 text-amber-700 border-amber-300" },
  { value: "problem", label: "Problem", color: "bg-red-100 text-red-700 border-red-300" },
];

export const EVENT_TYPE_META = {
  followup: { label: "Customer Follow-up", dot: "bg-emerald-500", badge: "bg-emerald-100 text-emerald-700" },
  delivery: { label: "Delivery", dot: "bg-red-500", badge: "bg-red-100 text-red-700" },
  pickup: { label: "Pickup", dot: "bg-orange-500", badge: "bg-orange-100 text-orange-700" },
  consultation: { label: "Build Consultation", dot: "bg-blue-500", badge: "bg-blue-100 text-blue-700" },
  shop_task: { label: "Shop Task", dot: "bg-slate-700", badge: "bg-slate-200 text-slate-700" },
  appointment: { label: "Appointment", dot: "bg-cyan-500", badge: "bg-cyan-100 text-cyan-700" },
  internal_reminder: { label: "Internal Reminder", dot: "bg-slate-500", badge: "bg-slate-100 text-slate-600" },
  personal_reminder: { label: "Personal Reminder", dot: "bg-purple-500", badge: "bg-purple-100 text-purple-700" },
};

export const CALENDAR_EVENT_TYPES = [
  { value: "appointment", label: "Appointment" },
  { value: "consultation", label: "Build Consultation" },
  { value: "delivery", label: "Engine Delivery" },
  { value: "pickup", label: "Engine Pickup" },
  { value: "shop_task", label: "Shop Task" },
  { value: "internal_reminder", label: "Internal Reminder" },
  { value: "personal_reminder", label: "Personal Reminder" },
];