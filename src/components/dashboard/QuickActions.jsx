import React from 'react';
import { Link } from 'react-router-dom';
import { Cpu, Users, ClipboardList, Briefcase } from 'lucide-react';

const actions = [
  { label:'New Estimate', icon:ClipboardList, to:'/EstimateDetail?new=1' },
  { label:'New Customer', icon:Users, to:'/Customers?new=1' },
  { label:'Jobs Board', icon:Briefcase, to:'/Jobs' },
];
export default function QuickActions({ onCheckIn }) {
  return <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
    <button onClick={onCheckIn} className="min-h-20 rounded-xl border border-red-200 bg-red-50 p-3 text-left hover:bg-red-100"><Cpu className="h-5 w-5 text-[#e20404] mb-2"/><span className="text-sm font-semibold text-slate-900">Check In Engine</span></button>
    {actions.map(a=><Link key={a.label} to={a.to} className="min-h-20 rounded-xl border border-slate-200 bg-white p-3 hover:bg-slate-50"><a.icon className="h-5 w-5 text-slate-600 mb-2"/><span className="text-sm font-semibold text-slate-900">{a.label}</span></Link>)}
  </div>;
}
