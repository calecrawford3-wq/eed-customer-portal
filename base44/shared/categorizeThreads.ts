// AI categorization of email threads — shared by the sync engine and the
// dedicated categorizeEmailThreads function so logic isn't duplicated.

export const EMAIL_CATEGORIES = [
  { value: "priority", desc: "Urgent or time-sensitive business messages needing a response or action" },
  { value: "customer", desc: "Customer inquiries, quotes, build/spec questions, and general customer correspondence" },
  { value: "supplier", desc: "Supplier/vendor communications, purchase order acknowledgments, shipping and parts updates" },
  { value: "billing", desc: "Invoices, payments, billing statements, account charges and financial documents" },
  { value: "promotional", desc: "Marketing, newsletters, deals, ads and sales offers" },
  { value: "notifications", desc: "Automated/system notifications, alerts, account statements and no-reply messages" },
  { value: "other", desc: "Anything that does not fit the categories above" },
];

const CATEGORY_VALUES = EMAIL_CATEGORIES.map((c) => c.value);
const BATCH_SIZE = 30;

/**
 * Fetch threads lacking a real category (or all if forceAll) and classify them
 * with the LLM in batches. Returns { processed, categorized, errors }.
 */
export async function categorizeUncategorizedThreads(base44, opts = {}) {
  const forceAll = !!opts.forceAll;
  const limit = opts.limit || 500;

  const threads = await base44.asServiceRole.entities.EmailThread.list("-last_message_at", limit);
  const targets = (threads || []).filter((t) => forceAll || !t.category || t.category === "uncategorized");
  if (!targets.length) return { processed: 0, categorized: 0, errors: [] };

  const errors = [];
  let categorized = 0;
  const catList = EMAIL_CATEGORIES.map((c) => `${c.value}: ${c.desc}`).join("\n");

  for (let i = 0; i < targets.length; i += BATCH_SIZE) {
    const batch = targets.slice(i, i + BATCH_SIZE);
    const items = batch.map((t) => ({
      id: t.id,
      subject: t.subject || "(no subject)",
      participants: (t.participant_emails || []).join(", "),
      account: t.account_address || "",
      customer: t.customer_name || "",
      supplier: t.supplier_name || "",
    }));

    const prompt =
      `You are an email triage assistant for an engine-building shop (Elite Engine Development).\n` +
      `Classify each email thread into exactly ONE category.\n\n` +
      `Categories:\n${catList}\n\n` +
      `Threads to classify (JSON array):\n${JSON.stringify(items)}\n\n` +
      `Return a JSON object: {"categories": [{"id": "<thread id>", "category": "<one of: ${CATEGORY_VALUES.join(", ")}>"}]}.\n` +
      `Only use the listed category values. Provide an entry for every thread in the array.`;

    try {
      const res = await base44.asServiceRole.integrations.Core.InvokeLLM({
        prompt,
        response_json_schema: {
          type: "object",
          properties: {
            categories: {
              type: "array",
              items: {
                type: "object",
                properties: { id: { type: "string" }, category: { type: "string" } },
                required: ["id", "category"],
              },
            },
          },
          required: ["categories"],
        },
      });

      const cats = res?.categories || res?.data?.categories || [];
      const updates = [];
      for (const c of cats) {
        if (!c?.id) continue;
        const cat = CATEGORY_VALUES.includes(c.category) ? c.category : "other";
        updates.push({ id: c.id, category: cat, categorized_at: new Date().toISOString() });
      }
      if (updates.length) {
        await base44.asServiceRole.entities.EmailThread.bulkUpdate(updates);
        categorized += updates.length;
      }
    } catch (e) {
      errors.push(`batch ${i}: ${e?.message || e}`);
    }
  }

  return { processed: targets.length, categorized, errors };
}