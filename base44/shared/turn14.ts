// Turn 14 account currently has TEST-only permission. Do not use production until approved.
const ROOT='https://apitest.turn14.com';
export async function turn14Request(path:string){
 const client_id=Deno.env.get('TURN14_CLIENT_ID');const client_secret=Deno.env.get('TURN14_CLIENT_SECRET');
 if(!client_id||!client_secret)throw new Error('Turn 14 credentials are not configured');
 const auth=await fetch(`${ROOT}/v1/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({grant_type:'client_credentials',client_id,client_secret}).toString()});
 if(!auth.ok){
  const contentType=auth.headers.get('content-type')||'';
  const responseText=(await auth.text()).slice(0,3000);
  let reason='';
  if(contentType.includes('json')){
    try{
      const data=JSON.parse(responseText);
      const code=typeof data.error==='string'?data.error:'';
      const description=typeof data.error_description==='string'?data.error_description:'';
      if(code==='invalid_client'||/client credentials are invalid/i.test(description))reason='Invalid client credentials';
      else if(code==='invalid_request')reason='Invalid authentication request';
      else if(code==='unsupported_grant_type')reason='Unsupported OAuth grant type';
      else if(code==='unauthorized_client')reason='API client not authorized';
      else if(code&&/^[a-z_]{1,40}$/.test(code))reason=code;
    }catch{}
  }
  if(!reason){
    if(/cloudflare|attention required|error 1020|access denied/i.test(responseText))reason='Request blocked by Turn 14 edge security (Cloudflare/access policy)';
    else if(/forbidden|not authorized|permission denied/i.test(responseText))reason='Access forbidden by Turn 14 server';
    else if(contentType.includes('html'))reason='Server returned an HTML access-denied page';
    else reason='Request rejected; contact Turn 14 API Support with the HTTP status and test hostname';
  }
  throw new Error(`Turn 14 authentication failed (${auth.status}) on apitest.turn14.com: ${reason}`);
 }
 const token=await auth.json();if(!token.access_token)throw new Error('Turn 14 did not return an access token');
 if(!/^\/v1\/[a-z0-9/?=&,]+$/i.test(path))throw new Error('Invalid Turn 14 path');
 const response=await fetch(`${ROOT}${path}`,{headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/json'}});
 if(!response.ok)throw new Error(`Turn 14 request failed (${response.status})`);
 return response.json();
}
export function itemArray(data:any){return Array.isArray(data?.data)?data.data:data?.data?[data.data]:[]}
