// Opens the native SMS app with a pre-drafted message body.
// Works on mobile (iOS/Android). `phone` is stripped to digits.
// Returns true if a message was opened, false if no usable phone number.
export function openSmsDraft(phone, body) {
  const digits = (phone || "").replace(/[^\d]/g, "");
  if (!digits) return false;
  const a = document.createElement("a");
  a.href = `sms:${digits}?&body=${encodeURIComponent(body)}`;
  a.rel = "noopener";
  a.style.display = "none";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  return true;
}