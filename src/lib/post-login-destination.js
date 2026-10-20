import {base44} from '@/api/base44Client';
import {portalDestination} from '@/lib/portal-entry';

// Determine the landing page using the authenticated Base44 identity and
// server-side HR permissions, not the email string typed into the login form.
export async function postLoginDestination(requested='/CustomerPortal'){
 const user=await base44.auth.me();
 if(!user?.email)throw Error('Unable to verify signed-in account');
 const result=await base44.functions.invoke('staffAccessGate',{});
 const data=result?.data;
 if(!data||data.access==='blocked'||data.access==='unauthenticated')throw Error('This account cannot access the portal. Contact the administrator.');
 if(data.access==='tax_only')return '/FormerEmployeeTaxPortal';
 if(user.role==='admin')return '/Dashboard';
 if(data.destination==='/EmployeePortal')return '/EmployeePortal';
 return portalDestination(requested,window.location.origin);
}
