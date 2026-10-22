import {createClientFromRequest} from 'npm:@base44/sdk';
import {syncSpecsFromBuild} from '../../shared/componentSpec.ts';
const rows=(v:any)=>Array.isArray(v)?v:v?.items||[];
Deno.serve(async req=>{try{const base44=createClientFromRequest(req),me=await base44.auth.me();if(me?.role!=='admin')return Response.json({error:'Admin required'},{status:403});const body=await req.json(),service=base44.asServiceRole,build=rows(await service.entities.EngineBuild.filter({id:body.build_id}))[0];if(!build)return Response.json({error:'Build not found'},{status:404});const result=await syncSpecsFromBuild(service,build,body.job_id||'',me?.full_name||me?.email||'Admin');return Response.json({success:true,...result});}catch(e){return Response.json({error:e.message},{status:400});}});
