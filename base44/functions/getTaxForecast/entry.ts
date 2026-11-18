import {createClientFromRequest} from 'npm:@base44/sdk@0.8.54';
const list=(v:any):any[]=>Array.isArray(v)?v:v?.items||[];
const cents=(v:any)=>Math.round(Number(v||0)*100);
export default async function(req:Request){
 if(req.method!=='POST')return Response.json({error:'POST required'},{status:405});
 const sdk=createClientFromRequest(req);const user=await sdk.auth.me();
 if(user?.role!=='admin')return Response.json({error:'Admin required'},{status:403});
 const body=await req.json().catch(()=>({}));
 const year=Number(body.year||new Date().getUTCFullYear());
 if(!Number.isInteger(year)||year<2026||year>2100)return Response.json({error:'Invalid year'},{status:400});
 const e=sdk.asServiceRole.entities;
 const [settingsRaw,expensesRaw,ledgerRaw]=await Promise.all([
  e.TaxForecastSettings.list('-created_date',100),e.Expense.list('-date',1000),e.VirtualLedgerEntry.list('-created_date',5000)
 ]);
 const settings=list(settingsRaw).find((x:any)=>x.tax_year===year)||null;
 const expenses=list(expensesRaw).filter((x:any)=>String(x.date||x.created_date||'').startsWith(String(year))&&x.is_deductible!==false&&x.category!=='taxes');
 const ledger=list(ledgerRaw);
 // A payout is a bank cash transfer, not gross sales or recognized business profit.
 // Never estimate taxable income from Stripe payout totals.
 const expenseCents=expenses.reduce((n:number,x:any)=>n+Math.max(0,cents(x.amount)),0);
 const reservedCents=ledger.filter((x:any)=>x.source_type==='tax_forecast_allocation'&&String(x.source_id||'')===String(year)).reduce((n:number,x:any)=>n+Number(x.amount_cents||0),0);
 const yearTransfers=ledger.filter((x:any)=>x.source_type==='tax_forecast_allocation'&&String(x.source_id||'')===String(year));
 return Response.json({
  year,settings,recorded_expenses_cents:expenseCents,
  reserved_for_year_cents:reservedCents,
  tax_allocation_entries:yearTransfers.length,
  profit_verified:false,
  automatic_tax_funding_enabled:false,
  reason:'A verified tax-year sales and cost-of-goods-sold ledger is not yet connected. Stripe payouts cannot be used as taxable sales. Configure tax assumptions, then connect invoice/payment and COGS reconciliation before enabling automated tax transfers.',
  year_boundary:'Tax forecasts filter by calendar tax year; virtual account balances and prior-year reserve entries are never reset.'
 });
}
