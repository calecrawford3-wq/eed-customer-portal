import React from 'react';
import { Link } from 'react-router-dom';
import { Cpu, ClipboardList, ScanLine, UserPlus, Plus } from 'lucide-react';

const starts = [
  {label:'New Estimate', icon:ClipboardList, to:'/EstimateDetail?new=1'},
  {label:'Scan', icon:ScanLine, to:'/BarcodeScan'},
  {label:'New Customer', icon:UserPlus, to:'/Customers?new=1'},
];
export default function HomeStartBar({onCheckIn}) {
 return <section aria-label="Start" className="rounded-2xl border border-slate-200 bg-white p-3 md:p-4">
   <div className="flex items-center gap-2 mb-2"><span className="text-xs font-bold uppercase tracking-wide text-slate-500">Start</span><div className="h-px bg-slate-100 flex-1"/></div>
   <div className="grid grid-cols-4 gap-2">
     <button onClick={onCheckIn} className="min-w-0 rounded-xl bg-[#e20404] text-white p-2.5 md:p-3 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 hover:bg-red-700 active:scale-[0.98] transition-all"><Cpu className="h-5 w-5 shrink-0"/><span className="text-[10px] sm:text-xs font-semibold text-center">Check In</span></button>
     {starts.map(a=><Link key={a.label} to={a.to} className="min-w-0 rounded-xl border border-slate-200 p-2.5 md:p-3 flex flex-col sm:flex-row items-center justify-center gap-1.5 sm:gap-2 hover:bg-slate-50 active:scale-[0.98] transition-all"><a.icon className="h-5 w-5 text-slate-600 shrink-0"/><span className="text-[10px] sm:text-xs font-semibold text-slate-800 text-center">{a.label}</span></Link>)}
   </div>
 </section>;
}
