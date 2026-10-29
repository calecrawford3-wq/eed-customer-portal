import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';

export default async function(req:Request):Promise<Response>{
 if(req.method!=='POST')return Response.json({error:'Method not allowed'},{status:405});
 try{
  const base44=createClientFromRequest(req);
  const user=await base44.auth.me();
  if(!user)return Response.json({error:'Authentication required'},{status:401});
  if(user.role!=='admin')return Response.json({error:'Admin access required'},{status:403});
  const input=await req.json();
  const title=String(input?.title||'').trim().slice(0,180);
  const keyword=String(input?.primary_keyword||'').trim().slice(0,150);
  const request=String(input?.request||'').trim().slice(0,3000);
  const existing=String(input?.existing||'').slice(0,16000);
  if(!title||!keyword)return Response.json({error:'Title and keyword are required'},{status:400});
  const prompt=`You are an expert technical content editor for Elite Engine Development, an Oklahoma-based 600cc micro sprint racing engine specialist working with Suzuki GSX-R600 and Yamaha YZF-R6 engines. Write useful, original, technically careful SEO content for real racing customers. Target keyword: ${keyword}. Page title: ${title}. ${request||'Create a comprehensive draft with a helpful introduction, 3-5 informative sections with Markdown ## headings, and a clear request-a-quote call to action.'} Do not invent horsepower claims, prices, dyno results, warranties, racing results, endorsements, part specifications, or testimonials. Explain where setup depends on rules and engine condition. Avoid keyword stuffing, generic fluff and unsupported guarantees. Include 2 to 4 relevant natural Markdown internal links within the body using only these real existing pages: [Suzuki GSX-R600 engines](/site/services/suzuki-gsxr600-micro-sprint-engines), [Yamaha R6 engines](/site/services/yamaha-r6-micro-sprint-engines), [engine refresh services](/site/services/micro-sprint-engine-refresh), [cylinder head machining](/site/services/micro-sprint-cylinder-head-machining), [fuel injection and methanol](/site/services/micro-sprint-fuel-injection-methanol), [dyno and track testing](/site/services/micro-sprint-dyno-track-testing), [request a quote](/site/inquiry), [engine resources](/site/resources). Do not invent article URLs or use irrelevant links. Return JSON title, meta_description (under 155 characters), body_markdown (500-900 words for a new draft, unless editing). ${existing?'CURRENT DRAFT TO REVISE:\n'+existing:''}`;
  const result=await base44.asServiceRole.integrations.Core.InvokeLLM({prompt,response_json_schema:{type:'object',properties:{title:{type:'string'},meta_description:{type:'string'},body_markdown:{type:'string'}},required:['title','meta_description','body_markdown']}});
  const data=typeof result==='string'?JSON.parse(result):result;
  if(!data?.title||!data?.body_markdown)return Response.json({error:'AI returned an incomplete draft'},{status:502});
  return Response.json({draft:{title:String(data.title).slice(0,180),meta_description:String(data.meta_description||'').slice(0,160),body_markdown:String(data.body_markdown)}},{headers:{'Cache-Control':'no-store'}});
 }catch(error){console.error('SEO draft generation failed',error);return Response.json({error:error instanceof Error?error.message:'AI generation failed'},{status:500})}
}
