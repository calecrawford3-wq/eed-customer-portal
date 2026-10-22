import React,{useEffect,useMemo,useState} from 'react';
import {base44} from '@/api/base44Client';
import {useQuery} from '@tanstack/react-query';
import {MapPin} from 'lucide-react';
import {Dialog,DialogContent,DialogFooter,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';

const FALLBACK=['Cart 1','Cart 2','Cart 3','Tote 1','Tote 2','Tote 3','Rack A-1','Rack A-2','Bench 1','Bench 2','Machining','Assembly'];
export default function ScanMoveLocationDialog({open,onClose,title='Move Location',currentLocation='',onConfirm,busy=false}){
 const [location,setLocation]=useState(currentLocation||'');
 const {data:settings=[]}=useQuery({queryKey:['app-settings'],queryFn:()=>base44.entities.AppSettings.filter({key:'global'}),enabled:open});
 useEffect(()=>{if(open)setLocation(currentLocation||'');},[open,currentLocation]);
 const choices=useMemo(()=>{try{const raw=settings?.[0]?.storage_locations;if(!raw)return FALLBACK;return [...new Set(Object.values(JSON.parse(raw)).flat().filter(Boolean))].slice(0,20);}catch{return FALLBACK;}},[settings]);
 return <Dialog open={open} onOpenChange={next=>!next&&!busy&&onClose()}><DialogContent className="sm:max-w-md"><DialogHeader><DialogTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-[#e20404]"/>{title}</DialogTitle></DialogHeader><div className="space-y-3"><div><Label>Physical location</Label><Input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Bench, cart, tote, machine..." autoFocus/></div><div className="flex flex-wrap gap-2">{choices.map(loc=><button key={loc} type="button" onClick={()=>setLocation(String(loc))} className={`text-xs px-3 py-1.5 rounded-full border ${location===loc?'border-[#e20404] bg-[#e20404] text-white':'border-slate-200 text-slate-600'}`}>{String(loc)}</button>)}</div></div><DialogFooter><Button variant="outline" onClick={onClose} disabled={busy}>Cancel</Button><Button className="bg-[#e20404] hover:bg-red-700" disabled={busy||!location.trim()} onClick={()=>onConfirm(location.trim())}>{busy?'Moving…':'Move'}</Button></DialogFooter></DialogContent></Dialog>;
}
