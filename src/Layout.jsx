import React,{useEffect,useRef,useState} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Home,Settings2,Search,ScanLine} from 'lucide-react';
import {createPageUrl} from './utils';
import usePushNotifications from '@/hooks/usePushNotifications';
import NotificationBell from '@/components/NotificationBell';
import GlobalSearch from '@/components/GlobalSearch';
import GlobalBarcodeListener from '@/components/GlobalBarcodeListener';
import {AppSectionNav} from '@/components/navigation/AppLauncher';
import MobileBottomNav from '@/components/mobile/MobileBottomNav';
import GlobalCreateMenu from '@/components/GlobalCreateMenu';
import {usePublicCompanyLogo} from '@/hooks/useCompanyLogo';

export default function Layout({children,currentPageName,staffMode=false,staffAllowedPages=[]}){
 const navigate=useNavigate();
 const {logoUrl}=usePublicCompanyLogo('dark');
 const pageScroller=useRef(null);
 const debugLayout=new URLSearchParams(window.location.search).has('layoutDebug');
 const [layoutMetrics,setLayoutMetrics]=useState(null);
 useEffect(()=>{
  if(!debugLayout)return;
  const measure=()=>{
   const shell=document.querySelector('.elite-app-shell');
   const scroller=pageScroller.current;
   const a=shell?.getBoundingClientRect();
   const b=scroller?.getBoundingClientRect();
   const y=window.innerHeight-30;
   const hit=document.elementFromPoint(window.innerWidth/2,y);
   setLayoutMetrics({innerHeight:window.innerHeight,visualHeight:window.visualViewport?.height,visualOffset:window.visualViewport?.offsetTop,shellBottom:a?.bottom,scrollBottom:b?.bottom,scrollHeight:scroller?.scrollHeight,clientHeight:scroller?.clientHeight,hit:hit?.tagName+'.'+String(hit?.className||'').slice(0,55)});
  };
  measure();window.addEventListener('resize',measure);
  const timer=setInterval(measure,1500);
  return()=>{window.removeEventListener('resize',measure);clearInterval(timer)};
 },[debugLayout]);
 useEffect(()=>{pageScroller.current?.scrollTo(0,0);},[currentPageName]);

 usePushNotifications();
 const isHome=currentPageName==='Dashboard';
 const isFullScreen=currentPageName==='BuildWorkflow'||currentPageName==='MachiningStation';
 const canUse=page=>!staffMode||staffAllowedPages.includes(page);
 return <div className="elite-app-shell fixed inset-0 flex flex-col overflow-hidden print:static print:overflow-visible" style={{backgroundColor:'#000000'}}>
   {!staffMode&&<GlobalBarcodeListener/>}
   {!staffMode&&<GlobalSearch/>}
   <header className="relative z-[100] flex-none text-white border-b border-slate-800 print:hidden" style={{paddingTop:"env(safe-area-inset-top, 0px)",backgroundColor:"#000000",backgroundImage:"none",boxShadow:"none",opacity:1,WebkitBackdropFilter:"none",backdropFilter:"none"}}>
    <div className="mx-auto max-w-screen-2xl min-h-14 px-3 md:px-8 flex items-center justify-between gap-2">
      <Link to={staffMode?'/EmployeePortal':'/Dashboard'} aria-label="Home" className="flex items-center gap-2 min-w-0"><img src={logoUrl} alt="Elite Engine Development" className="h-8 md:h-10 max-w-40 object-contain"/><span className="hidden lg:block text-xs text-slate-400 border-l border-slate-700 pl-3">SHOP PORTAL</span></Link>
      <nav className="hidden lg:flex items-center gap-1 text-sm mr-2" aria-label="Primary">
        <Link to="/Dashboard" className="rounded-lg px-3 py-2 hover:bg-slate-800">Today</Link>
        <Link to="/Jobs" className="rounded-lg px-3 py-2 hover:bg-slate-800">Jobs</Link>
        <Link to="/Customers" className="rounded-lg px-3 py-2 hover:bg-slate-800">Customers</Link>
        <Link to="/Communications" className="rounded-lg px-3 py-2 hover:bg-slate-800">Inbox</Link>
      </nav>
      <div className="flex items-center gap-1 sm:gap-2">
        {!isHome&&<Link to={staffMode?'/EmployeePortal':'/Dashboard'} className="hidden md:flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm hover:bg-slate-800" aria-label="Home"><Home className="h-5 w-5"/><span className="hidden sm:inline">Home</span></Link>}
        {!staffMode&&<GlobalCreateMenu/>}
        {!staffMode&&<button aria-label="Search" title="Search" className="rounded-lg p-2.5 hover:bg-slate-800" onClick={()=>document.dispatchEvent(new KeyboardEvent('keydown',{metaKey:true,key:'k'}))}><Search className="h-5 w-5"/></button>}
        {!staffMode&&canUse('BarcodeScan')&&<button aria-label="Scan" title="Scan engine" className="hidden md:inline-flex rounded-lg p-2.5 hover:bg-slate-800" onClick={()=>navigate(createPageUrl('BarcodeScan'))}><ScanLine className="h-5 w-5"/></button>}
        {!staffMode&&<NotificationBell/>}
        {!staffMode&&!isHome&&<Link to="/Settings" aria-label="Settings" title="Settings" className="hidden md:inline-flex rounded-lg p-2.5 hover:bg-slate-800"><Settings2 className="h-5 w-5"/></Link>}
      </div>
    </div>
   </header>
   <div ref={pageScroller} data-elite-page-scroll className={'flex-1 min-h-0 overflow-y-auto overscroll-contain bg-slate-50 '+(!staffMode&&!isFullScreen?'elite-mobile-nav-space':'')} style={{WebkitOverflowScrolling:'touch'}}>
    {!isHome&&!isFullScreen&&<AppSectionNav page={currentPageName} allowedPages={staffMode?staffAllowedPages:null}/>}
    <main className="mx-auto max-w-screen-2xl min-w-0 min-h-full">{children}</main>
   </div>
   {!staffMode&&!isFullScreen&&<MobileBottomNav/>}
   {debugLayout&&<div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:99999,background:'#111827',color:'white',fontSize:12,padding:'8px 12px',fontFamily:'monospace',pointerEvents:'none'}}>{JSON.stringify(layoutMetrics)}</div>}
 </div>;
}
