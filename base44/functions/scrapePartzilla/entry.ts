import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const url = body?.url;
    if (!url || !/^https?:\/\//i.test(url)) {
      return Response.json({ error: 'A valid URL is required' }, { status: 400 });
    }

    let resp;
    try {
      resp = await fetch('https://r.jina.ai/' + url, {
        headers: { 'Accept': 'text/plain' },
        redirect: 'follow',
      });
    } catch (e) {
      return Response.json({ error: 'Could not reach the page: ' + e.message }, { status: 502 });
    }
    if (!resp.ok) {
      return Response.json({ error: `Page returned status ${resp.status}` }, { status: 502 });
    }
    const text = await resp.text();
    const cleaned = text.replace(/\s+/g, ' ').slice(0, 45000);

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are parsing page content (markdown/text fetched from Partzilla.com, an OEM powersports/marine parts catalog) for a part diagram or product page. Extract every distinct part listed on the page as a JSON array. For each part include: part_number (the OEM part number, often numeric or alphanumeric), name (the part name/description as shown), price (USD number, 0 if not listed), description (short, optional), category_hint (one of: block, cylinder_head, rotating_assembly, crankshaft, valvetrain, timing, oiling, fasteners, gaskets, seals, electrical, other). Only include real listed parts — no navigation items, no categories, no buttons. If the page lists no parts, return an empty array.\n\nCONTENT:\n${cleaned}`,
      response_json_schema: {
        type: "object",
        properties: {
          parts: {
            type: "array",
            items: {
              type: "object",
              properties: {
                part_number: { type: "string" },
                name: { type: "string" },
                price: { type: "number" },
                description: { type: "string" },
                category_hint: { type: "string" },
              },
            },
          },
        },
      },
    });

    const parts = Array.isArray(llmRes?.parts) ? llmRes.parts : [];
    return Response.json({ parts, sourceUrl: url });
  } catch (error) {
    console.error('scrapePartzilla error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});