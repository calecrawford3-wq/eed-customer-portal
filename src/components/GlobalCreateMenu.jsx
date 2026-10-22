import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Cpu, Users, ClipboardList, Receipt, ShoppingCart, TrendingDown, ScanLine, Briefcase } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EngineCheckInModal from '@/components/engines/EngineCheckInModal';

const actions = [
  { label: 'New Job', icon: Briefcase, to: '/Jobs?new=1' },
  { label: 'Check In Engine', icon: Cpu, type: 'checkin' },
  { label: 'Scan', icon: ScanLine, to: '/BarcodeScan' },
  { label: 'New Customer', icon: Users, to: '/Customers?new=1' },
  { label: 'Standalone Estimate', icon: ClipboardList, to: '/EstimateDetail?new=1&standalone=1' },
  { label: 'New Invoice', icon: Receipt, to: '/InvoiceDetail?new=1' },
  { label: 'New Purchase Order', icon: ShoppingCart, to: '/PurchaseOrderDetail?new=1' },
  { label: 'New Expense', icon: TrendingDown, to: '/Expenses?new=1' },
];

export default function GlobalCreateMenu({ variant = 'header' }) {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [checkInOpen, setCheckInOpen] = useState(false);

  const choose = (action) => {
    setOpen(false);
    if (action.type === 'checkin') { setCheckInOpen(true); return; }
    let to = action.to;
    const current = new URLSearchParams(location.search);
    const currentId = current.get('id');
    if (currentId && location.pathname.toLowerCase().includes('customerdetail') && (to.startsWith('/EstimateDetail') || to.startsWith('/InvoiceDetail') || to.startsWith('/Jobs?new=1'))) {
      to += `&customer_id=${encodeURIComponent(currentId)}`;
    }
    if (currentId && location.pathname.toLowerCase().includes('jobcard') && to.startsWith('/EstimateDetail')) {
      to += `&job_id=${encodeURIComponent(currentId)}`;
    }
    navigate(to);
  };

  return <>
    {variant === 'nav' ? (
      <button aria-label="Create" title="Quick create" onClick={() => setOpen(true)} className="flex-1 flex flex-col items-center justify-center gap-0.5 py-1.5 relative" style={{ minHeight: '50px' }}>
        <span className="h-11 w-11 -mt-6 rounded-full bg-[#e20404] shadow-lg flex items-center justify-center border-4 border-white">
          <Plus className="h-6 w-6 text-white" strokeWidth={2.8} />
        </span>
        <span className="text-[10px] font-semibold text-[#e20404]">Create</span>
      </button>
    ) : (
      <button aria-label="Create" title="Create" onClick={() => setOpen(true)} className="rounded-lg p-2.5 hover:bg-slate-800">
        <Plus className="h-5 w-5" />
      </button>
    )}
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md max-h-[85dvh] overflow-y-auto">
        <DialogHeader><DialogTitle>Quick Actions</DialogTitle></DialogHeader>
        <div className="grid grid-cols-2 gap-2">
          {actions.map(action => <button key={action.label} onClick={() => choose(action)} className="min-h-24 rounded-xl border border-slate-200 bg-white p-3 text-left hover:border-red-200 hover:bg-red-50 transition-colors">
            <action.icon className="h-5 w-5 text-[#e20404] mb-2" />
            <span className="text-sm font-semibold text-slate-900">{action.label}</span>
          </button>)}
        </div>
      </DialogContent>
    </Dialog>
    <EngineCheckInModal open={checkInOpen} onClose={() => setCheckInOpen(false)} />
  </>;
}
