import { createClientFromRequest } from 'npm:@base44/sdk@0.8.54';

const origin = 'https://eliteenginedevelopment.com';
const escapeXml = (value: string) => value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&apos;');

Deno.serve(async (req: Request) => {
  if (req.method !== 'GET') return new Response('Method not allowed', { status: 405 });
  try {
    const sdk = createClientFromRequest(req);
    const result = await sdk.asServiceRole.entities.WebsiteSEOPage.filter({ status: 'published' });
    const rows = Array.isArray(result) ? result : result?.items || [];
    const slugs = [...new Set(rows.map((p: any) => p.slug).filter((slug: unknown) => typeof slug === 'string' && /^[a-z0-9-]{3,100}$/.test(slug)))].slice(0, 10000);
    const urls = slugs.map(slug => '<url><loc>' + escapeXml(origin + '/site/articles/' + slug) + '</loc></url>').join('');
    const xml = '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">' + urls + '</urlset>';
    return new Response(xml, { headers: { 'Content-Type': 'application/xml; charset=utf-8', 'Cache-Control': 'public, max-age=300' } });
  } catch (error) {
    console.error('Unable to generate article sitemap', error);
    return new Response('Sitemap temporarily unavailable', { status: 503 });
  }
});
