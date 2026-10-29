const fail=(error:string,status=400)=>Response.json({error},{status,headers:{'Cache-Control':'no-store'}});
export default async function(req:Request){
 if(req.method!=='POST')return fail('Method not allowed',405);
 try{
  const key=Deno.env.get('GEOAPIFY_API_KEY');
  if(!key)return Response.json({suggestions:[],configured:false},{headers:{'Cache-Control':'no-store'}});
  const body=await req.json().catch(()=>({})),text=String(body.text||'').trim();
  if(text.length<4||text.length>160)return Response.json({suggestions:[],configured:true});
  const url=new URL('https://api.geoapify.com/v1/geocode/autocomplete');
  url.searchParams.set('text',text);url.searchParams.set('filter','countrycode:us');url.searchParams.set('format','json');url.searchParams.set('limit','6');url.searchParams.set('apiKey',key);
  const response=await fetch(url.toString());
  if(!response.ok)return fail('Address suggestions unavailable',502);
  const data=await response.json(),suggestions=(data.results||[]).filter((p:any)=>p.address_line1&&p.city&&p.state_code&&p.postcode).map((p:any)=>({label:[p.address_line1,p.address_line2].filter(Boolean).join(', '),line1:String(p.address_line1),city:String(p.city),state:String(p.state_code).toUpperCase(),postal_code:String(p.postcode),country:'US'})).slice(0,6);
  return Response.json({suggestions,configured:true},{headers:{'Cache-Control':'no-store'}});
 }catch{return fail('Address suggestions unavailable',503)}
}
