const rows = (v:any) => Array.isArray(v) ? v : v?.items || [];
const dec31For = (date:string) => `${new Date(`${date}T12:00:00Z`).getUTCFullYear()}-12-31`;

export const PCS_RULES = [
  { key:'feature_1', subtype:'1st Place', amount:100 },
  { key:'feature_2', subtype:'2nd Place', amount:75 },
  { key:'feature_3', subtype:'3rd Place', amount:50 },
  { key:'feature_4_5', subtype:'4th-5th Place', amount:25 },
  { key:'b_win', subtype:'B Feature Win', amount:15 },
  { key:'heat_win', subtype:'Heat Race Win', amount:10 },
  { key:'top10_3', subtype:'Top 10 Consistency (3+ in a row)', amount:50 },
  { key:'feature_start', subtype:'Feature Start Bonus', amount:10 },
];

function finishRule(position:number) {
  if (position === 1) return PCS_RULES[0];
  if (position === 2) return PCS_RULES[1];
  if (position === 3) return PCS_RULES[2];
  if (position === 4 || position === 5) return PCS_RULES[3];
  return null;
}

export async function applyPerformanceCreditsForRaceResult(base44:any, race:any) {
  if (!race?.id || !race.customer_id || !race.event_date) throw new Error('Race result is incomplete');
  const Result=base44.asServiceRole.entities.RaceResult;
  const Credit=base44.asServiceRole.entities.AccountCredit;
  if (race.status === 'credited') return {credit_ids:race.credit_ids||[],duplicate:true};
  const rules:any[]=[];
  const finish=finishRule(Number(race.finish_position)); if(finish) rules.push(finish);
  if(Number(race.b_feature_finish_position)===1) rules.push(PCS_RULES.find(r=>r.key==='b_win'));
  if(Number(race.heat_finish_position)===1) rules.push(PCS_RULES.find(r=>r.key==='heat_win'));
  if(race.feature_started) rules.push(PCS_RULES.find(r=>r.key==='feature_start'));

  const history=rows(await Result.filter({customer_id:race.customer_id},'-event_date',25))
    .filter((r:any)=>r.id!==race.id && r.event_date<=race.event_date)
    .sort((a:any,b:any)=>String(b.event_date).localeCompare(String(a.event_date)));
  const currentTop10=Number(race.finish_position)>=1&&Number(race.finish_position)<=10;
  const prior0=Number(history[0]?.finish_position)>=1&&Number(history[0]?.finish_position)<=10;
  const prior1=Number(history[1]?.finish_position)>=1&&Number(history[1]?.finish_position)<=10;
  const prior2=Number(history[2]?.finish_position)>=1&&Number(history[2]?.finish_position)<=10;
  if(currentTop10&&prior0&&prior1&&!prior2) rules.push(PCS_RULES.find(r=>r.key==='top10_3'));

  const creditIds:string[]=[];
  for(const rule of rules.filter(Boolean)) {
    const ref=`race:${race.source_result_id||race.id}:${rule.key}`;
    let credit=rows(await Credit.filter({customer_id:race.customer_id,type:'performance',source_reference:ref}))[0];
    if(!credit) credit=await Credit.create({customer_id:race.customer_id,amount:rule.amount,type:'performance',subtype:rule.subtype,description:`${rule.subtype} · ${race.event_name||race.track_name||race.event_date}`,source_reference:ref,source_result_id:race.id,date:race.event_date,expires_on:dec31For(race.event_date),status:'active',activated_at:new Date().toISOString()});
    if(credit?.id) creditIds.push(credit.id);
  }
  await Result.update(race.id,{status:'credited',credit_ids:creditIds,processed_at:new Date().toISOString()});
  return {credit_ids:creditIds,total:rules.filter(Boolean).reduce((n,r)=>n+r.amount,0),rules:rules.filter(Boolean).map(r=>r.subtype),duplicate:false};
}
