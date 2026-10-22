import React, { useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight, X } from 'lucide-react';

// Each step points at a real control in CustomerPortal. The selected tab is
// changed first, then the spotlight follows the control even on narrow screens.
const steps = [
  {title:'Home', target:'home', tab:'home', body:'Home shows the things that need your attention first, including approvals and payments, so you do not have to hunt through the portal.'},
  {title:'My Engines', target:'engines', tab:'engines', body:'My Engines keeps each engine and its build history together. Use the Engines and Build History controls inside this section when you want more detail.'},
  {title:'Documents & Payments', target:'documents', tab:'invoices', body:'Estimates, inspection findings, invoices, payments, credits and tax records are grouped here. Use the smaller category buttons to move between them.'},
  {title:'Account', target:'account', tab:'account', body:'Account contains your contact information, notification and security settings, cars and drivers, and saved payment settings.'},
];
const locate = target => document.querySelector('[data-tour="' + target + '"]');

export default function PortalTour({onFinish,onClose,onNavigate}) {
  const [index,setIndex] = useState(0);
  const [spot,setSpot] = useState(null);
  const [detailsOpen,setDetailsOpen] = useState(false);
  const panelRef = useRef(null);
  const step=steps[index];
  useEffect(()=>setDetailsOpen(false),[index]);

  useEffect(()=>{
    if(step.tab) onNavigate?.(step.tab);
    let alive=true;
    let timeout;
    const position=()=>{
      const element=locate(step.target);
      if(!element) {if(alive)setSpot(null);return;}
      const mobile=window.innerWidth<640;
      const rect=element.getBoundingClientRect();
      if(mobile && step.tab){
        // Highlight both the navigation and a visible preview of the active tab.
        // Otherwise the mobile tour describes a tab whose contents are offscreen.
        const nav=element.closest('[role="tablist"]');
        const active=document.querySelector('[role="tabpanel"][data-state="active"]');
        const navRect=nav?.getBoundingClientRect() || rect;
        const contentRect=active?.getBoundingClientRect();
        const panelTop=panelRef.current?.getBoundingClientRect().top ?? window.innerHeight*0.64;
        const top=Math.max(0,navRect.top-5);
        const bottom=Math.min(panelTop-12, contentRect ? Math.max(navRect.bottom+10,contentRect.top+Math.min(contentRect.height,135)) : navRect.bottom+20);
        if(alive)setSpot({top,left:navRect.left-5,width:navRect.width+10,height:Math.max(0,bottom-top)});
      }else if(alive)setSpot({top:rect.top,left:rect.left,width:rect.width,height:rect.height});
    };
    // Scroll the navigation into the space above the mobile instruction card.
    const move=()=>{
      const element=locate(step.target);
      if(element){
        const mobile=window.innerWidth<640;
        const anchor=mobile && step.tab ? element.closest('[role="tablist"]') || element : element;
        const y=window.scrollY+anchor.getBoundingClientRect().top-(mobile ? 16 : 75);
        window.scrollTo({top:Math.max(0,y),behavior:'smooth'});
      }
      position();
    };
    timeout=setTimeout(move,100);
    const delayed=setTimeout(position,650);
    const observer=typeof ResizeObserver!=='undefined' ? new ResizeObserver(position) : null;
    if(panelRef.current)observer?.observe(panelRef.current);
    window.addEventListener('resize',position);
    window.addEventListener('scroll',position,{passive:true});
    return ()=>{alive=false;clearTimeout(timeout);clearTimeout(delayed);observer?.disconnect();window.removeEventListener('resize',position);window.removeEventListener('scroll',position);};
  },[index]);

  return <>
    {spot && <div aria-hidden="true" className="fixed pointer-events-none rounded-lg border-[3px] border-red-500 transition-all duration-150" style={{
      zIndex:60,top:Math.max(0,spot.top-5),left:Math.max(0,spot.left-5),
      width:spot.width+10,height:spot.height+10,
      boxShadow:'0 0 0 9999px rgba(8,15,30,0.58), 0 0 0 5px rgba(239,68,68,0.25)'
    }}/>}
    {!spot && <div className="fixed inset-0 bg-slate-950/60 pointer-events-none" style={{zIndex:60}} aria-hidden="true"/>}
    <section ref={panelRef} role="dialog" aria-modal="true" aria-label="Guided portal tour" className="fixed left-3 right-3 bottom-3 sm:left-1/2 sm:right-auto sm:w-[440px] sm:-translate-x-1/2 rounded-2xl border border-red-200 bg-white shadow-2xl p-3 sm:p-5 max-h-[36dvh] sm:max-h-[46vh] overflow-y-auto" style={{zIndex:70}}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-xs font-semibold uppercase tracking-wide text-red-700">Guided tour · Step {index+1} of {steps.length}</p>
        <Button type="button" size="icon" variant="ghost" className="h-8 w-8 -mt-2 -mr-2" aria-label="Skip tour" onClick={onClose}><X className="h-4 w-4"/></Button>
      </div>
      <h2 className="mt-1 text-lg font-bold text-slate-900">{step.title}</h2>
      <p className={`mt-1 text-sm leading-snug text-slate-600 ${detailsOpen ? '' : 'line-clamp-2 sm:line-clamp-none'}`}>{step.body}</p>
      <button type="button" className="sm:hidden text-xs font-semibold text-red-700 underline" onClick={()=>setDetailsOpen(v=>!v)}>{detailsOpen?'Less detail':'Read full explanation'}</button>
      <p className="mt-1 text-xs text-slate-500">{spot ? (step.tab ? 'Highlighted: selected tab and its contents.' : 'Highlighted: the control on this page.') : 'This feature is not currently visible. You can still continue the tour.'}</p>
      <div className="mt-2 sm:mt-4 flex items-center justify-between gap-2">
        <Button type="button" variant="outline" disabled={index===0} onClick={()=>setIndex(i=>i-1)}><ChevronLeft className="w-4 h-4 mr-1"/> Back</Button>
        {index<steps.length-1
          ? <Button type="button" className="bg-[#e20404] hover:bg-red-700" onClick={()=>setIndex(i=>i+1)}>Next <ChevronRight className="w-4 h-4 ml-1"/></Button>
          : <Button type="button" className="bg-[#e20404] hover:bg-red-700" onClick={onFinish}>Finish tour</Button>}
      </div>
    </section>
  </>;
}
