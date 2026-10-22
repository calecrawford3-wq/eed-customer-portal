import React,{useState} from 'react';
import {Download,ScanLine} from 'lucide-react';
import {Dialog,DialogContent,DialogHeader,DialogTitle} from '@/components/ui/dialog';
import {Button} from '@/components/ui/button';
import {Input} from '@/components/ui/input';
import {Label} from '@/components/ui/label';
import {downloadLaserTagSvg} from '@/lib/laserTagFile';

export default function EngineTagFilesDialog({open,onClose,engine,head,platformName=''}){
 const [widthMm,setWidthMm]=useState(60);const [heightMm,setHeightMm]=useState(25);
 const download=(kind)=>{const item=kind==='head'?head:engine;if(!item)return;downloadLaserTagSvg({kind,displayId:kind==='head'?item.component_code:engine.eed_id,serial:kind==='case'?engine.engine_serial_number:'',platform:platformName,tagCode:item.tag_code,widthMm,heightMm});};
 return <Dialog open={open} onOpenChange={next=>!next&&onClose()}><DialogContent className="sm:max-w-lg"><DialogHeader><DialogTitle>Laser Engraving Files</DialogTitle></DialogHeader>
  <div className="space-y-4">
   <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm text-slate-600"><p className="font-semibold text-slate-900">Vector SVG, ready for laser software</p><p className="mt-1">The files contain only permanent identity information. Customer, Job, and current pairing data stay in Elite and change when the tag is scanned.</p></div>
   <div className="grid grid-cols-2 gap-3"><div><Label>Tag width (mm)</Label><Input type="number" min="25" max="100" value={widthMm} onChange={e=>setWidthMm(Number(e.target.value)||60)}/></div><div><Label>Tag height (mm)</Label><Input type="number" min="12" max="60" value={heightMm} onChange={e=>setHeightMm(Number(e.target.value)||25)}/></div></div>
   <div className="grid sm:grid-cols-2 gap-3">
    <div className="rounded-xl border p-4"><div className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-[#e20404]"/><p className="font-semibold">Case / Bottom End</p></div><p className="mt-2 font-mono font-bold text-lg">{engine?.eed_id||'—'}</p><p className="text-xs text-slate-500">SN {engine?.engine_serial_number||'—'}</p><Button className="mt-3 w-full" variant="outline" disabled={!engine?.tag_code} onClick={()=>download('case')}><Download className="h-4 w-4 mr-1"/>Download Case SVG</Button></div>
    <div className="rounded-xl border p-4"><div className="flex items-center gap-2"><ScanLine className="h-4 w-4 text-[#e20404]"/><p className="font-semibold">Cylinder Head</p></div><p className="mt-2 font-mono font-bold text-lg">{head?.component_code||'—'}</p><p className="text-xs text-slate-500">Permanent random head ID</p><Button className="mt-3 w-full" variant="outline" disabled={!head?.tag_code} onClick={()=>download('head')}><Download className="h-4 w-4 mr-1"/>Download Head SVG</Button></div>
   </div>
  </div>
 </DialogContent></Dialog>;
}
