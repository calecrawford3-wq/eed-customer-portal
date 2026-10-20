// The estimate viewer now reads directly from this app's own Estimate entity.
// No cross-app snapshot transfer or SYNC_SECRET is required.
export async function buildAndPushEstimateSnapshot(base44: any, estimateId: string, publicAccessToken: string): Promise<{success:boolean;viewerLink:string;error?:string}> {
  const res = await base44.asServiceRole.entities.Estimate.filter({id:estimateId});
  const doc = (res?.items || res || [])[0];
  if (!doc || doc.public_access_token !== publicAccessToken) return {success:false,viewerLink:'',error:'Estimate token does not match'};
  return {success:true,viewerLink:'https://portal.eedpower.com/estimate/'+encodeURIComponent(publicAccessToken)};
}
