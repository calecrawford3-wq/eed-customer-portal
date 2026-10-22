export const DEFAULT_COMPANY_LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png';

export function resolveCompanyLogo(settings, background='light'){
  const legacy=String(settings?.company_logo_url||'').trim();
  const light=String(settings?.company_logo_light_url||'').trim();
  const dark=String(settings?.company_logo_dark_url||'').trim();
  return background==='dark'
    ? (dark||legacy||light||DEFAULT_COMPANY_LOGO_URL)
    : (light||legacy||dark||DEFAULT_COMPANY_LOGO_URL);
}
