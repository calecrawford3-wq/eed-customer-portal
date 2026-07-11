import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    const query = (body?.query || '').trim();
    if (!query) {
      return Response.json({ error: 'A search query is required' }, { status: 400 });
    }

    // Search DuckDuckGo (HTML endpoint) restricted to partzilla.com — returns real Partzilla URLs.
    const ddgUrl = 'https://html.duckduckgo.com/html/?q=' + encodeURIComponent('site:partzilla.com ' + query);
    let resp;
    try {
      resp = await fetch(ddgUrl, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'text/html',
        },
        redirect: 'follow',
      });
    } catch (e) {
      return Response.json({ error: 'Search request failed: ' + e.message }, { status: 502 });
    }
    if (!resp.ok) {
      return Response.json({ error: 'Search returned status ' + resp.status }, { status: 502 });
    }
    const html = await resp.text();
    const cleaned = html.replace(/\s+/g, ' ').slice(0, 30000);

    const llmRes = await base44.asServiceRole.integrations.Core.InvokeLLM({
      prompt: `You are parsing DuckDuckGo search results (HTML flattened to text) for a query restricted to partzilla.com. Extract every Partzilla result link. For each include: name (the result title), url (the full https://www.partzilla.com/... URL, decoded if URL-encoded), type ("page" for catalog/model/diagram listing pages that themselves list parts; "part" only if the title clearly names a specific part with an OEM part number), part_number (OEM part number if clearly shown in the title, else ""), price (USD number if shown in the snippet, 0 if not), category_hint (one of: block, cylinder_head, rotating_assembly, crankshaft, valvetrain, timing, oiling, fasteners, gaskets, seals, electrical, other). Only include real partzilla.com URLs that appear in the results — never invent URLs. If no Partzilla results are present, return an empty array.\n\nCONTENT:\n${cleaned}`,
      response_json_schema: {
        type: "object",
        properties: {
          results: {
            type: "array",
            items: {
              type: "object",
              properties: {
                name: { type: "string" },
                url: { type: "string" },
                type: { type: "string" },
                part_number: { type: "string" },
                price: { type: "number" },
                category_hint: { type: "string" },
              },
            },
          },
        },
      },
    });

    const results = Array.isArray(llmRes?.results) ? llmRes.results : [];
    return Response.json({ results, query });
  } catch (error) {
    console.error('searchPartzilla error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});