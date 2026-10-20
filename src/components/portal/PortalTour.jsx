import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Each step points at a real control in CustomerPortal. The selected tab is
// changed first, then the spotlight follows the control even on narrow screens.
const steps = [
  {title:'My Engines', target:'engines', tab:'engines', body:'This is where your engines and their service history appear. Select My Engines whenever you want to review an engine. It is normal for this section to be empty before Elite assigns one.'},
  {title:'Engine Builds', target:'builds', tab:'builds', body:'Open Engine Builds to follow work on your engines and view available build details and documentation.'},
  {title:'Estimates & Approvals', target:'estimates', tab:'estimates', body:'When Elite sends you an estimate, open this tab to review the work and approve or decline it.'},
  {title:'Invoices & Payments', target:'invoices', tab:'invoices', body:'Find your invoices, review balances and use the secure payment options here.'},
  {title:'Findings & Inspections', target:'findings', tab:'findings', body:'Inspection findings, supporting photos and work requiring your attention are found here.'},
  {title:'My Account', target:'account', tab:null, body:'Use My Account to update your contact information, racing preferences and notification settings.'},
  {title:'Cars & Drivers', target:'garage', tab:null, body:'Use Cars & Drivers to add cars, drivers and chassis details, and associate your engines with cars without changing shop ownership.'},
];
const locate = target => document.querySelector('[data-tour="' + target + '"]');

export default function PortalTour({onFinish,onClose,onNavigate}) {
  const [index,setIndex] = useState(0);
  const [spot,setSpot] = useState(null);
  const step=steps[index];

  useEffect(()=>{
    if(step.tab) onNavigate?.(step.tab);
    let alive=true;
    let timeout;
    const position=()=>{
      const element=locate(step.target);
      if(!element) {if(alive)setSpot(null);return;}
      const rect=element.getBoundingClientRect();
      if(alive)setSpot({top:rect.top,left:rect.left,width:rect.width,height:rect.height});
    };
    // Wait for React to render the newly selected tab before positioning.
    const move=()=>{
      const element=locate(step.target);
      if(element)element.scrollIntoView({behavior:'smooth',block:'start',inline:'nearest'});
      position();
    };
    timeout=setTimeout(move,90);
    const delayed=setTimeout(position,500);
    window.addEventListener('resize',position);
    window.addEventListener('scroll',position,{passive:true});
    return ()=>{alive=false;clearTimeout(timeout);clearTimeout(delayed);window.removeEventListener('resize',position);window.removeEventListener('scroll',position);};
  },[index]);

  return <>
    {spot && <div aria-hidden="true" className="fixed pointer-events-none rounded-lg border-[3px] border-red-500 transition-all duration-150" style={{
      zIndex:60,top:Math.max(0,spot.top-5),left:Math.max(0,spot.left-5),
      width:spot.width+10,height:spot.height+10,
      boxShadow:'0 0 0 9999px rgba(8,15,30,0.58), 0 0 0 5px rgba(239,68,68,0.25)'
    }}/>}
    {!spot && <div className="fixed inset-0 bg-slate-950/60 pointer-events-none" style={{zIndex:60}} aria-hidden="true"/>}
    <section role="dialog" aria-modal="true" aria-label="Guided portal tour" className="fixed left-3 right-3 bottom-3 sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2 rounded-2xl border border-red-200 bg-white shadow-2xl p-4 sm:p-5 max-h-[46vh] overflow-y-auto" style={{zIndex:70}}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Guided tour · Step {index+1} of {steps.length}</p>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 -mt-2 -mr-2" aria-label="Skip tour" onClick={onClose}><X className="h-4 w-4"/></Button>
      </div>
      <h2 className="mt-1 text-lg font-bold text-slate-900">{step.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-slate-600">{step.body}</p>
      <p className="mt-2 text-xs text-slate-500">{spot ? 'The highlighted control is shown on the page above.' : 'This feature is not currently visible. You can still continue the tour.'}</p>
      <div className="mt-4 flex items-center justify-between gap-2">
        <Button type="button" variant="outline" disabled={index===0} onClick={()=>setIndex(i=>i-1)}><ChevronLeft className="w-4 h-4 mr-1"/> Back</Button>
        {index<steps.length-1
          ? <Button type="button" className="bg-[#e20404] hover:bg-red-700" onClick={()=>setIndex(i=>i+1)}>Next <ChevronRight className="w-4 h-4 ml-1"/></Button>
          : <Button type="button" className="bg-[#e20404] hover:bg-red-700" onClick={onFinish}>Finish tour</Button>}
      </div>
    </section>
  </>;
}
