import React, { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Plus, Cpu, Users, ClipboardList, Receipt, ShoppingCart, TrendingDown } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import EngineCheckInModal from '@/components/engines/EngineCheckInModal';

const actions = [
  { label: 'Check In Engine', icon: Cpu, type: 'checkin' },
  { label: 'New Customer', icon: Users, to: '/Customers?new=1' },
  { label: 'New Estimate', icon: ClipboardList, to: '/EstimateDetail?new=1' },
  { label: 'New Invoice', icon: Receipt, to: '/InvoiceDetail?new=1' },
  { label: 'New Purchase Order', icon: ShoppingCart, to: '/PurchaseOrderDetail?new=1' },
  { label: 'New Expense', icon: TrendingDown, to: '/Expenses?new=1' },
];

export default function GlobalCreateMenu() {
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
    if (currentId && location.pathname.toLowerCase().includes('customerdetail') && (to.startsWith('/EstimateDetail') || to.startsWith('/InvoiceDetail'))) {
      to += `&customer_id=${encodeURIComponent(currentId)}`;
    }
    if (currentId && location.pathname.toLowerCase().includes('jobcard') && to.startsWith('/EstimateDetail')) {
      to += `&job_id=${encodeURIComponent(currentId)}`;
    }
    navigate(to);
  };

  return <>
    <button aria-label="Create" title="Create" onClick={() => setOpen(true)} className="rounded-lg p-2.5 hover:bg-slate-800">
      <Plus className="h-5 w-5" />
    </button>
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader><DialogTitle>Create</DialogTitle></DialogHeader>
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
