import React,{useEffect,useRef} from 'react';
import {Link,useNavigate} from 'react-router-dom';
import {Home,Settings2,Search,ScanLine} from 'lucide-react';
import {createPageUrl} from './utils';
import usePushNotifications from '@/hooks/usePushNotifications';
import NotificationBell from '@/components/NotificationBell';
import GlobalSearch from '@/components/GlobalSearch';
import GlobalBarcodeListener from '@/components/GlobalBarcodeListener';
import {AppSectionNav} from '@/components/navigation/AppLauncher';

const LOGO='https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/698c030b5d990c423f12b5d8/a0d24b852_EliteEDNoBG1.png';
export default function Layout({children,currentPageName,staffMode=false,staffAllowedPages=[]}){
 const navigate=useNavigate();
 const pageScroller=useRef(null);
 useEffect(()=>{pageScroller.current?.scrollTo(0,0);},[currentPageName]);
 usePushNotifications();
 const isHome=currentPageName==='Dashboard';
 const isFullScreen=currentPageName==='BuildWorkflow'||currentPageName==='MachiningStation';
 const canUse=page=>!staffMode||staffAllowedPages.includes(page);
 return <div className="elite-app-shell flex flex-col bg-slate-50" style={{height:"100dvh",minHeight:0}}>
   {!staffMode&&<GlobalBarcodeListener/>}
   {!staffMode&&<GlobalSearch/>}
   <header className="relative z-[100] flex-none text-white border-b border-slate-800 print:hidden" style={{paddingTop:"env(safe-area-inset-top, 0px)",backgroundColor:"#0f172a",backgroundImage:"none",boxShadow:"none",opacity:1,WebkitBackdropFilter:"none",backdropFilter:"none"}}>
    <div className="mx-auto max-w-screen-2xl min-h-14 px-3 md:px-8 flex items-center justify-between gap-2">
      <Link to={staffMode?'/EmployeePortal':'/Dashboard'} aria-label="Home" className="flex items-center gap-2 min-w-0"><img src={LOGO} alt="Elite Engine Development" className="h-8 md:h-10 max-w-40 object-contain"/><span className="hidden lg:block text-xs text-slate-400 border-l border-slate-700 pl-3">SHOP PORTAL</span></Link>
      <div className="flex items-center gap-1 sm:gap-2">
        {!isHome&&<Link to={staffMode?'/EmployeePortal':'/Dashboard'} className="flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm hover:bg-slate-800" aria-label="Home"><Home className="h-5 w-5"/><span className="hidden sm:inline">Home</span></Link>}
        {!staffMode&&<button aria-label="Search" title="Search" className="rounded-lg p-2.5 hover:bg-slate-800" onClick={()=>document.dispatchEvent(new KeyboardEvent('keydown',{metaKey:true,key:'k'}))}><Search className="h-5 w-5"/></button>}
        {!staffMode&&canUse('BarcodeScan')&&<button aria-label="Scan" title="Scan engine" className="rounded-lg p-2.5 hover:bg-slate-800" onClick={()=>navigate(createPageUrl('BarcodeScan'))}><ScanLine className="h-5 w-5"/></button>}
        {!staffMode&&<NotificationBell/>}
        {!staffMode&&!isHome&&<Link to="/Settings" aria-label="Settings" title="Settings" className="rounded-lg p-2.5 hover:bg-slate-800"><Settings2 className="h-5 w-5"/></Link>}
      </div>
    </div>
   </header>
   <div ref={pageScroller} data-elite-page-scroll className="flex-1 min-h-0 overflow-y-auto overscroll-contain bg-slate-50" style={{WebkitOverflowScrolling:"touch"}}>
    {!isHome&&!isFullScreen&&<AppSectionNav page={currentPageName} allowedPages={staffMode?staffAllowedPages:null}/>}
    <main className="mx-auto max-w-screen-2xl min-w-0" style={{paddingBottom:"env(safe-area-inset-bottom, 0px)"}}>{children}</main>
   </div>
 </div>;
}
