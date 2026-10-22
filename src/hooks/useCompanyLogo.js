import {useQuery} from '@tanstack/react-query';
import {base44,base44Public} from '@/api/base44Client';
import {DEFAULT_COMPANY_LOGO_URL,resolveCompanyLogo} from '@/lib/companyLogo';

export function useCompanyLogo(background='light'){
  const {data:settingsRows=[]}=useQuery({queryKey:['app-settings'],queryFn:()=>base44.entities.AppSettings.filter({key:'global'}),staleTime:60000});
  const settings=settingsRows?.[0]||null;
  return {logoUrl:settings?resolveCompanyLogo(settings,background):DEFAULT_COMPANY_LOGO_URL,settings};
}

export function usePublicCompanyLogo(background='light'){
  const {data}=useQuery({queryKey:['public-company-settings'],queryFn:async()=>{const r=await base44Public.functions.invoke('getPublicSettings',{});return r?.data?.settings||{};},staleTime:60000});
  return {logoUrl:data?resolveCompanyLogo(data,background):DEFAULT_COMPANY_LOGO_URL,settings:data||null};
}
