import { createClientFromRequest } from 'npm:@base44/sdk@0.8.31';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json().catch(() => ({}));
    let url = (body?.url || '').trim();
    if (!url) {
      return Response.json({ error: 'A URL is required' }, { status: 400 });
    }
    if (!/^https?:\/\//i.test(url)) {
      url = 'https://www.partzilla.com/' + url.replace(/^\/+/, '');
    }
    if (!/partzilla\.com/i.test(url)) {
      return Response.json({ error: 'Only partzilla.com pages can be browsed' }, { status: 400 });
    }

    const headers = { 'Accept': 'text/plain', 'X-Return-Format': 'markdown' };

    let resp;
    try {
      resp = await fetch('https://r.jina.ai/' + url, { headers, redirect: 'follow' });
    } catch (e) {
      return Response.json({ error: 'Could not reach the page: ' + e.message }, { status: 502 });
    }
    if (!resp.ok) {
      const msg = resp.status === 429
        ? 'The catalog read proxy is rate limiting us — wait a few seconds and retry.'
        : 'Page returned status ' + resp.status;
      return Response.json({ error: msg }, { status: resp.status === 429 ? 429 : 502 });
    }

    const text = await resp.text();
    let title = url;
    const tm = text.match(/^Title:\s*(.+)$/m);
    if (tm) title = tm[1].trim();
    let md = text;
    const idx = text.indexOf('Markdown Content:');
    if (idx >= 0) md = text.slice(idx + 'Markdown Content:'.length);
    return Response.json({ markdown: md.slice(0, 60000), title, url });
  } catch (error) {
    console.error('browsePartzilla error:', error);
    return Response.json({ error: error.message }, { status: 500 });
  }
});