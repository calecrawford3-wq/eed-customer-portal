import { base44 } from "@/api/base44Client";

/**
 * Generates a clean sequential document number (e.g., EST-0001, INV-0001).
 * Ignores legacy timestamp-based numbers (6-digit suffixes) and only
 * counts from existing sequential numbers (4-digit padded, < 10000).
 */
export async function generateSequentialNumber(prefix, entityName, fieldName) {
  try {
    const records = await base44.entities[entityName].list("-created_date", 500);
    let maxSeq = 0;
    records.forEach(r => {
      const num = r[fieldName];
      if (num) {
        const match = num.match(/(\d+)$/);
        if (match) {
          const n = parseInt(match[1], 10);
          if (n < 10000 && n > maxSeq) maxSeq = n;
        }
      }
    });
    return `${prefix}-${String(maxSeq + 1).padStart(4, "0")}`;
  } catch {
    return `${prefix}-${Date.now().toString().slice(-6)}`;
  }
}