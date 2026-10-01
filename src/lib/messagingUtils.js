import { base44 } from "@/api/base44Client";
import { compressImage } from "@/lib/compressImage";

export const MAX_ATTACHMENTS = 3;
export const MAX_ATTACHMENT_BYTES = 1300 * 1024;

export const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/gif",
]);

export function normalizePhone(value) {
  if (!value) return "";
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 10) {
    digits = `1${digits}`;
  }
  return digits;
}

export function formatPhoneDisplay(value) {
  if (!value) return "";
  let digits = String(value).replace(/\D/g, "");
  if (digits.length === 11 && digits.startsWith("1")) {
    digits = digits.slice(1);
  }
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return String(value);
}

export function formatTime(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

export function formatDayLabel(iso) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const now = new Date();
  if (date.toDateString() === now.toDateString()) return "Today";
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (date.toDateString() === yesterday.toDateString()) return "Yesterday";
  return date.toLocaleDateString("en-US", { month: "long", day: "numeric" });
}

export function getCustomerFullName(customer) {
  if (!customer) return "";
  return `${customer.first_name || ""} ${customer.last_name || ""}`.trim();
}

export function getContactFullName(contact) {
  if (!contact) return "";
  return `${contact.first_name || ""} ${contact.last_name || ""}`.trim();
}

export function findCustomerByPhone(customers, phoneNumber) {
  const target = normalizePhone(phoneNumber);
  if (!target) return null;
  return customers.find((c) => normalizePhone(c.phone) === target) || null;
}

export function findContactByPhone(customerContacts, phoneNumber) {
  const target = normalizePhone(phoneNumber);
  if (!target) return null;
  return customerContacts.find((c) => normalizePhone(c.phone) === target) || null;
}

export function resolveConversationParty(customers, customerContacts, phoneNumber, messages = []) {
  const primaryCustomer = findCustomerByPhone(customers, phoneNumber);
  if (primaryCustomer) {
    return {
      customer: primaryCustomer,
      contact: null,
      customerName: getCustomerFullName(primaryCustomer),
      contactName: "",
      customerId: primaryCustomer.id,
    };
  }
  const additionalContact = findContactByPhone(customerContacts, phoneNumber);
  if (additionalContact) {
    const parentCustomer = customers.find((c) => c.id === additionalContact.customer_id) || null;
    return {
      customer: parentCustomer,
      contact: additionalContact,
      customerName: getCustomerFullName(parentCustomer),
      contactName: getContactFullName(additionalContact),
      customerId: parentCustomer?.id || additionalContact.customer_id || null,
    };
  }
  return {
    customer: null,
    contact: null,
    customerName: messages.find((m) => m.customer_name)?.customer_name || "",
    contactName: messages.find((m) => m.contact_name)?.contact_name || "",
    customerId: messages.find((m) => m.customer_id)?.customer_id || null,
  };
}

export function getDisplayName(contactName, customerName, fallback) {
  const contact = String(contactName || "").trim();
  const customer = String(customerName || "").trim();
  if (contact && customer && contact.toLowerCase() === customer.toLowerCase()) return customer;
  if (contact && customer) return `${contact} · ${customer}`;
  return contact || customer || fallback;
}

export function getMediaUrls(message) {
  const value = message?.media_urls;
  if (Array.isArray(value)) {
    return value.map((item) => String(item || "").trim()).filter(Boolean);
  }
  if (typeof value !== "string" || !value.trim()) return [];
  try {
    const parsed = JSON.parse(value);
    if (Array.isArray(parsed)) {
      return parsed.map((item) => String(item || "").trim()).filter(Boolean);
    }
  } catch {
    // Continue with comma/newline parsing.
  }
  return value.split(/[\n,]+/).map((item) => item.trim()).filter(Boolean);
}

export function getConversationPreview(message) {
  if (!message) return "";
  const body = String(message.body || "").trim();
  const mediaUrls = getMediaUrls(message);
  if (body && mediaUrls.length > 0) return `📷 ${body}`;
  if (body) return body;
  if (mediaUrls.length === 1) return "📷 Photo";
  if (mediaUrls.length > 1) return `📷 ${mediaUrls.length} photos`;
  if (message.channel === "mms") return "📎 MMS attachment";
  return "";
}

export function getErrorMessage(error, fallback) {
  return error?.response?.data?.error || error?.data?.error || error?.message || fallback;
}

export function revokeAttachmentPreviews(attachments) {
  attachments.forEach((attachment) => {
    if (attachment?.previewUrl) {
      URL.revokeObjectURL(attachment.previewUrl);
    }
  });
}

export async function buildAttachmentsFromFiles(files, existingCount = 0) {
  const selectedFiles = Array.from(files || []);
  const remainingSlots = MAX_ATTACHMENTS - existingCount;
  if (remainingSlots <= 0) {
    throw new Error(`A maximum of ${MAX_ATTACHMENTS} images can be attached.`);
  }
  if (selectedFiles.length > remainingSlots) {
    throw new Error(`You can only add ${remainingSlots} more image${remainingSlots === 1 ? "" : "s"}.`);
  }
  for (const file of selectedFiles) {
    if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
      throw new Error("Only JPG, JPEG, PNG, and GIF images can be attached.");
    }
  }
  const processed = await Promise.all(
    selectedFiles.map(async (file) => {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        try {
          return await compressImage(file, MAX_ATTACHMENT_BYTES);
        } catch {
          throw new Error(`Could not compress "${file.name}" under 1,300 KB.`);
        }
      }
      return file;
    })
  );
  return processed.map((file) => ({
    id: `${file.name}-${file.size}-${file.lastModified}-${crypto.randomUUID()}`,
    file,
    previewUrl: URL.createObjectURL(file),
  }));
}

export async function uploadAttachments(attachments) {
  const uploadedUrls = [];
  for (const attachment of attachments) {
    const result = await base44.integrations.Core.UploadFile({ file: attachment.file });
    if (!result?.file_url) {
      throw new Error(`Upload failed for ${attachment.file.name}.`);
    }
    uploadedUrls.push(result.file_url);
  }
  return uploadedUrls;
}