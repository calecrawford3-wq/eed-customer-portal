export const DEFAULT_COMPANY_LOGO_URL = 'https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png';

export function resolveCompanyLogo(settings){
  return String(settings?.company_logo_url || '').trim() || DEFAULT_COMPANY_LOGO_URL;
}
