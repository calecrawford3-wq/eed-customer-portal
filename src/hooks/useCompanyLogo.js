import {useQuery} from '@tanstack/react-query';
import {base44} from '@/api/base44Client';
import {DEFAULT_COMPANY_LOGO_URL,resolveCompanyLogo} from '@/lib/companyLogo';

export function useCompanyLogo(){
  const {data:settingsRows=[]}=useQuery({queryKey:['app-settings'],queryFn:()=>base44.entities.AppSettings.filter({key:'global'}),staleTime:60000});
  const settings=settingsRows?.[0]||null;
  return {logoUrl:settings?resolveCompanyLogo(settings):DEFAULT_COMPANY_LOGO_URL,settings};
}
