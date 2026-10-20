import React,{useState,useEffect} from 'react';
import { Button } from '@/components/ui/button';
import { Card,CardContent,CardHeader,CardTitle } from '@/components/ui/card';

const steps=[
  {title:'Your engines',tab:'engines',body:'See engines assigned to your account and review service and build history.'},
  {title:'Estimates and approvals',tab:'estimates',body:'Review estimate details and approve or decline requested work. Optional profile setup never blocks approval.'},
  {title:'Invoices and payments',tab:'invoices',body:'Open invoices, check balances and use the existing secure checkout.'},
  {title:'Findings and build books',tab:'findings',body:'Review inspection findings and available build documentation.'},
  {title:'My Account and racing garage',tab:null,body:'Keep your contact details, cars, drivers and racing information up to date.'},
];
export default function PortalTour({onFinish,onClose,onNavigate}) {
  const [index,setIndex]=useState(0);
  const step=steps[index];
  useEffect(()=>{if(step.tab)onNavigate?.(step.tab);},[index]);
  return <Card className="border-red-200"><CardHeader><CardTitle>Quick portal tour</CardTitle><p className="text-sm text-slate-600">Step {index+1} of {steps.length}</p></CardHeader><CardContent className="space-y-4"><div role="group" aria-label={'Tour step '+(index+1)}><h3 className="text-lg font-semibold">{step.title}</h3><p className="text-sm text-slate-600 mt-2">{step.body}</p></div><div className="flex flex-wrap gap-2"><Button variant="outline" disabled={index===0} onClick={()=>setIndex(i=>i-1)}>Back</Button>{index<steps.length-1?<Button onClick={()=>setIndex(i=>i+1)}>Next</Button>:<Button onClick={onFinish}>Finish tour</Button>}<Button variant="ghost" onClick={onClose}>Skip for now</Button></div></CardContent></Card>;
}
