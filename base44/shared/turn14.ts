const ROOT='https://api.turn14.com';
export async function turn14Request(path:string){
 const client_id=Deno.env.get('TURN14_CLIENT_ID');const client_secret=Deno.env.get('TURN14_CLIENT_SECRET');
 if(!client_id||!client_secret)throw new Error('Turn 14 credentials are not configured');
 const auth=await fetch(`${ROOT}/v1/token`,{method:'POST',headers:{'Content-Type':'application/x-www-form-urlencoded','Accept':'application/json'},body:new URLSearchParams({grant_type:'client_credentials',client_id,client_secret}).toString()});
 if(!auth.ok){
  let reason='';
  try {const data=await auth.json();
    const code=typeof data.error==='string'?data.error:'';
    const description=typeof data.error_description==='string'?data.error_description:'';
    // Do not echo untrusted response text containing credentials or tokens.
    if(code==='invalid_client'||/client credentials are invalid/i.test(description))reason='Invalid client credentials. Verify the Client ID and Client Secret in Base44.';
    else if(code==='invalid_request')reason='Invalid authentication request.';
    else if(code==='unsupported_grant_type')reason='Unsupported OAuth grant type.';
    else if(code==='unauthorized_client')reason='Client is not authorized for API access.';
    else reason=code&&/^[a-z_]{1,40}$/.test(code)?code:'Authentication request rejected.';
  }catch{reason='Authentication request rejected.';}
  throw new Error(`Turn 14 authentication failed (${auth.status}): ${reason}`);
 }
 const token=await auth.json();if(!token.access_token)throw new Error('Turn 14 did not return an access token');
 if(!/^\/v1\/[a-z0-9/?=&,]+$/i.test(path))throw new Error('Invalid Turn 14 path');
 const response=await fetch(`${ROOT}${path}`,{headers:{Authorization:`Bearer ${token.access_token}`,Accept:'application/json'}});
 if(!response.ok)throw new Error(`Turn 14 request failed (${response.status})`);
 return response.json();
}
export function itemArray(data:any){return Array.isArray(data?.data)?data.data:data?.data?[data.data]:[]}
