import { createClientFromRequest } from 'npm:@base44/sdk@0.8.40';

export default async function(req) {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const { q, limit = 60, before } = await req.json().catch(() => ({}));
    if (!q || !String(q).trim()) return Response.json({ emails: [], has_more: false });

    const term = String(q).trim();
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const re = { $regex: escaped, $options: "i" };
    const clauses = [
      { $or: [
        { subject: re }, { from_email: re }, { from_name: re }, { to_email: re },
        { body_text: re }, { preview: re }, { customer_name: re }, { supplier_name: re },
      ]},
    ];
    if (before) clauses.push({ received_at: { $lt: before } });
    const query = clauses.length > 1 ? { $and: clauses } : clauses[0];

    const fetchLimit = limit + 1;
    const emails = await base44.entities.Email.filter(query, "-received_at", fetchLimit);
    const has_more = emails.length > limit;
    const page = has_more ? emails.slice(0, limit) : emails;
    return Response.json({ emails: page, has_more, count: page.length });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
}