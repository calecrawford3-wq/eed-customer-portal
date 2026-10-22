import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { ScanLine, Package, Recycle, Minus, Plus, Save, RotateCcw, MapPin, DollarSign, AlertTriangle, Edit, Cpu, Component, Briefcase, ShieldCheck, Wrench, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import BarcodeScanner from "@/components/inventory/BarcodeScanner";
import BarcodeLabel from "@/components/inventory/BarcodeLabel";
import PartEditModal from "@/components/inventory/PartEditModal";
import ScanMoveLocationDialog from "@/components/scan/ScanMoveLocationDialog";

export default function BarcodeScan() {
  const [results, setResults] = useState([]); // [{ type, item }]
  const [searching, setSearching] = useState(false);
  const [qtyInputs, setQtyInputs] = useState({}); // `${type}:${id}` -> string
  const [editingPart, setEditingPart] = useState(null);
  const qc = useQueryClient();
  const navigate = useNavigate();

  const lookup = async (code) => {
    const clean = code.trim();
    if (!clean) return;
    setSearching(true);
    setResults([]);
    setQtyInputs({});
    try {
      const [partsExact, cores, caseTags, caseIds, headTags, headCodes] = await Promise.all([
        base44.entities.Part.filter({ part_number: clean }),
        base44.entities.EngineCore.filter({ core_number: clean }),
        base44.entities.CustomerEngine.filter({ tag_code: clean }),
        base44.entities.CustomerEngine.filter({ eed_id: clean }),
        base44.entities.EngineComponent.filter({ tag_code: clean }),
        base44.entities.EngineComponent.filter({ component_code: clean }),
      ]);
      let parts = partsExact || [];
      if (!parts.length && clean.length > 11) parts = await base44.entities.Part.filter({ part_number: clean.slice(0, 11) });
      const found = [];
      parts.forEach((p) => found.push({ type: "part", item: p }));
      cores.forEach((c) => found.push({ type: "core", item: c }));
      [...caseTags,...caseIds].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).forEach((e)=>found.push({type:'engine',item:e}));
      [...headTags,...headCodes].filter((x,i,a)=>a.findIndex(y=>y.id===x.id)===i).forEach((h)=>found.push({type:'head',item:h}));
      if (found.length === 0) {
        toast.error(`No item found for "${clean}"`);
      } else {
        setResults(found);
        const q = {};
        found.filter(r=>r.type === "part" || r.type === "core").forEach((r) => {
          q[`${r.type}:${r.item.id}`] = String(r.item.quantity_on_hand ?? 0);
        });
        setQtyInputs(q);
        if (found.length > 1) {
          toast.info(`Found ${found.length} items for "${clean}"`);
        }
      }
    } catch (e) {
      toast.error("Lookup failed: " + (e.message || e));
    } finally {
      setSearching(false);
    }
  };

  const adjustMutation = useMutation({
    mutationFn: /** @param {Record<string, any>} args */ async ({ id, type, qty }) => {
      if (type === "part") return base44.entities.Part.update(id, { quantity_on_hand: qty });
      return base44.entities.EngineCore.update(id, { quantity_on_hand: qty });
    },
    onSuccess: (updated, vars) => {
      setResults((rs) => rs.map((r) =>
        r.type === vars.type && r.item.id === vars.id
          ? { ...r, item: { ...r.item, quantity_on_hand: updated.quantity_on_hand } }
          : r
      ));
      setQtyInputs((q) => ({ ...q, [`${vars.type}:${vars.id}`]: String(updated.quantity_on_hand) }));
      qc.invalidateQueries({ queryKey: ["parts"] });
      qc.invalidateQueries({ queryKey: ["engineCores"] });
      toast.success("Inventory updated");
    },
    onError: (e) => toast.error("Update failed: " + (e.message || e)),
  });

  const saveQty = (r) => {
    const key = `${r.type}:${r.item.id}`;
    const qty = Number(qtyInputs[key]) || 0;
    adjustMutation.mutate({ id: r.item.id, type: r.type, qty });
  };

  const bump = (r, delta) => {
    const key = `${r.type}:${r.item.id}`;
    const cur = Number(qtyInputs[key]) || 0;
    setQtyInputs((q) => ({ ...q, [key]: String(Math.max(0, cur + delta)) }));
  };

  const reset = () => {
    setResults([]);
    setQtyInputs({});
  };

  // Auto-lookup when navigated here with ?code= (from the global scanner toast)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    if (code) lookup(code);
     
  }, []);

  return (
    <div className="p-4 md:p-8 max-w-4xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl md:text-3xl font-bold text-slate-900 flex items-center gap-2">
          <ScanLine className="w-7 h-7 text-[#e20404]" /> Scan
        </h1>
        <p className="text-slate-500 mt-1">Scan a laser engine/head tag, Job code, part, or core. Engine tags open the current internal workflow; inventory items can still be adjusted here.</p>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-lg">Scan Anything</CardTitle>
        </CardHeader>
        <CardContent>
          {searching ? (
            <div className="flex items-center gap-2 text-slate-500 py-4">
              <div className="w-5 h-5 border-2 border-slate-200 border-t-[#e20404] rounded-full animate-spin" />
              Looking up item...
            </div>
          ) : (
            <BarcodeScanner onScan={lookup} preserveFullCode />
          )}
        </CardContent>
      </Card>

      {results.map((r) => {
        const item = r.item;
        const key = `${r.type}:${item.id}`;
        if (r.type === "engine") return <EngineScanCard key={key} engine={item} navigate={navigate}/>;
        if (r.type === "head") return <HeadScanCard key={key} head={item} navigate={navigate}/>;
        const isPart = r.type === "part";
        const qVal = qtyInputs[key] ?? String(item.quantity_on_hand ?? 0);
        return (
          <Card key={key} className="mb-4">
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 flex-wrap">
                <span className="flex items-center gap-2">
                  {isPart ? <Package className="w-5 h-5 text-blue-600" /> : <Recycle className="w-5 h-5 text-emerald-600" />}
                  {item.name}
                </span>
                <Badge className={isPart ? "bg-blue-100 text-blue-700 border-0" : "bg-emerald-100 text-emerald-700 border-0"}>
                  {isPart ? "Part" : "Engine Core"}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-col sm:flex-row gap-4 items-center justify-between bg-slate-50 rounded-lg p-4">
                <div className="text-center">
                  <BarcodeLabel value={isPart ? item.part_number : item.core_number} />
                </div>
                <div className="flex-1 grid grid-cols-2 gap-3 w-full">
                  <div>
                    <Label className="text-xs text-slate-500">{isPart ? "Part #" : "Core #"}</Label>
                    <p className="font-mono font-medium text-slate-800">{isPart ? item.part_number : item.core_number}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Location</Label>
                    <p className="text-slate-800 flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400" />{item.location || "—"}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Category</Label>
                    <p className="text-slate-800 capitalize">{item.category?.replace("_", " ")}</p>
                  </div>
                  <div>
                    <Label className="text-xs text-slate-500">Status</Label>
                    <Badge className="bg-slate-100 text-slate-600 border-0">{item.status}</Badge>
                  </div>
                  {isPart ? (
                    <>
                      <div>
                        <Label className="text-xs text-slate-500">Unit Cost</Label>
                        <p className="text-slate-800 flex items-center gap-1"><DollarSign className="w-3 h-3 text-slate-400" />{item.unit_cost ? Number(item.unit_cost).toFixed(2) : "—"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Sell Price</Label>
                        <p className="text-slate-800">{item.sell_price ? `$${Number(item.sell_price).toFixed(2)}` : "—"}</p>
                      </div>
                    </>
                  ) : (
                    <>
                      <div>
                        <Label className="text-xs text-slate-500">Core Value</Label>
                        <p className="text-slate-800">{item.unit_cost ? `$${Number(item.unit_cost).toFixed(2)}` : "—"}</p>
                      </div>
                      <div>
                        <Label className="text-xs text-slate-500">Condition</Label>
                        <Badge className="bg-amber-100 text-amber-700 border-0 capitalize">{(item.condition || "").replace("_", " ")}</Badge>
                      </div>
                    </>
                  )}
                </div>
              </div>

              {item.description && (
                <div>
                  <Label className="text-xs text-slate-500">Description</Label>
                  <p className="text-sm text-slate-600">{item.description}</p>
                </div>
              )}

              <div className="border-t pt-4">
                <Label className="text-sm font-medium text-slate-700">Adjust Quantity On Hand</Label>
                <div className="flex items-center gap-2 mt-2 flex-wrap">
                  <Button variant="outline" size="icon" onClick={() => bump(r, -1)}><Minus className="w-4 h-4" /></Button>
                  <Input
                    type="number"
                    className="w-28 text-center text-lg font-semibold"
                    value={qVal}
                    onChange={(e) => setQtyInputs((q) => ({ ...q, [key]: e.target.value }))}
                  />
                  <Button variant="outline" size="icon" onClick={() => bump(r, 1)}><Plus className="w-4 h-4" /></Button>
                  <Button className="bg-[#e20404] hover:bg-[#c00303] text-white" onClick={() => saveQty(r)} disabled={adjustMutation.isPending}>
                    <Save className="w-4 h-4 mr-1" /> {adjustMutation.isPending ? "Saving..." : "Save"}
                  </Button>
                  {isPart && (
                    <Button variant="outline" onClick={() => setEditingPart(item)}>
                      <Edit className="w-4 h-4 mr-1" /> Edit Details
                    </Button>
                  )}
                </div>
                {(item.reorder_point > 0 && (Number(qVal) || 0) <= item.reorder_point) && (
                  <p className="text-xs text-amber-600 mt-2 flex items-center gap-1"><AlertTriangle className="w-3.5 h-3.5" /> At or below reorder point ({item.reorder_point}).</p>
                )}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {results.length > 0 && (
        <Button variant="outline" onClick={reset}><RotateCcw className="w-4 h-4 mr-1" /> Scan Next</Button>
      )}

      <PartEditModal
        part={editingPart}
        open={!!editingPart}
        onClose={() => setEditingPart(null)}
        onSaved={(updated) => {
          setResults((rs) => rs.map((rr) => rr.type === "part" && rr.item.id === editingPart?.id ? { ...rr, item: { ...rr.item, ...updated } } : rr));
          setEditingPart(null);
        }}
      />
    </div>
  );
}

function EngineScanCard({engine,navigate}) {
  const qc=useQueryClient();const [job,setJob]=useState(null);const [item,setItem]=useState(engine);const [moveOpen,setMoveOpen]=useState(false);const [moving,setMoving]=useState(false);
  useEffect(()=>{let live=true;base44.entities.Job.filter({customer_engine_id:engine.id}).then(rows=>{if(live)setJob((rows||[]).find(j=>!j.archived&&j.stage!=="picked_up")||null);});return()=>{live=false};},[engine.id]);
  const move=async(location)=>{setMoving(true);try{await base44.entities.CustomerEngine.update(item.id,{storage_location:location});if(job){const history=job.location_history||[];await base44.entities.Job.update(job.id,{storage_location:location,location_history:[...history,{from:job.storage_location||item.storage_location||'',to:location,date:new Date().toISOString(),actor:'Scan'}]});setJob({...job,storage_location:location});}setItem({...item,storage_location:location});qc.invalidateQueries({queryKey:['customer-engines']});qc.invalidateQueries({queryKey:['jobs']});setMoveOpen(false);toast.success(`Moved ${item.eed_id} to ${location}`);}catch(e){toast.error('Could not move engine: '+(e.message||e));}finally{setMoving(false);}};
  return <><Card className="mb-4 border-red-100"><CardHeader><CardTitle className="flex items-center justify-between gap-2 flex-wrap"><span className="flex items-center gap-2"><Cpu className="w-5 h-5 text-[#e20404]"/>{item.eed_id} · Case / Bottom End</span><Badge className="bg-red-50 text-red-700 border-0">Engine Tag</Badge></CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid sm:grid-cols-3 gap-3 text-sm"><div><Label className="text-xs text-slate-500">Serial</Label><p className="font-mono">{item.engine_serial_number}</p></div><div><Label className="text-xs text-slate-500">Location</Label><p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400"/>{job?.storage_location||item.storage_location||'—'}</p></div><div><Label className="text-xs text-slate-500">Current Job</Label><p>{job?.job_number||'No active job'}</p></div></div><div className="flex flex-wrap gap-2">{job?<><Button className="bg-[#e20404] hover:bg-red-700" onClick={()=>navigate(`/JobCard?id=${job.id}`)}><Briefcase className="w-4 h-4 mr-1"/>Open Job</Button><Button variant="outline" onClick={()=>navigate(`/JobCard?id=${job.id}&tab=work&work=verify`)}><ShieldCheck className="w-4 h-4 mr-1"/>Verify Components</Button><Button variant="outline" onClick={()=>navigate(`/JobCard?id=${job.id}&tab=work&work=machining`)}><Wrench className="w-4 h-4 mr-1"/>Machining</Button><Button variant="outline" onClick={()=>navigate(`/JobCard?id=${job.id}&tab=findings`)}><ClipboardList className="w-4 h-4 mr-1"/>Findings</Button></>:<Button className="bg-[#e20404] hover:bg-red-700" onClick={()=>navigate(`/Jobs?new=1&customer_id=${item.customer_id}&customer_engine_id=${item.id}`)}><Plus className="w-4 h-4 mr-1"/>Start Job</Button>}<Button variant="outline" onClick={()=>setMoveOpen(true)}><MapPin className="w-4 h-4 mr-1"/>Move Location</Button><Button variant="ghost" onClick={()=>navigate(`/CustomerDetail?id=${item.customer_id}`)}>Engine Record</Button></div></CardContent></Card><ScanMoveLocationDialog open={moveOpen} onClose={()=>setMoveOpen(false)} title={`Move ${item.eed_id}`} currentLocation={job?.storage_location||item.storage_location||''} onConfirm={move} busy={moving}/></>;
}

function HeadScanCard({head,navigate}) {
  const qc=useQueryClient();const [item,setItem]=useState(head);const [engine,setEngine]=useState(null);const [job,setJob]=useState(null);const [moveOpen,setMoveOpen]=useState(false);const [moving,setMoving]=useState(false);
  useEffect(()=>{let live=true;(async()=>{if(!item.current_customer_engine_id){setEngine(null);setJob(null);return;}const engines=await base44.entities.CustomerEngine.filter({id:item.current_customer_engine_id});const e=engines?.[0]||null;if(!live)return;setEngine(e);if(e){const jobs=await base44.entities.Job.filter({customer_engine_id:e.id});if(live)setJob((jobs||[]).find(j=>!j.archived&&j.stage!=="picked_up")||null);}})();return()=>{live=false};},[item.current_customer_engine_id]);
  const move=async(location)=>{setMoving(true);try{await base44.entities.EngineComponent.update(item.id,{storage_location:location});setItem({...item,storage_location:location});qc.invalidateQueries({queryKey:['engine-heads']});setMoveOpen(false);toast.success(`Moved ${item.component_code} to ${location}`);}catch(e){toast.error('Could not move head: '+(e.message||e));}finally{setMoving(false);}};
  return <><Card className="mb-4 border-purple-100"><CardHeader><CardTitle className="flex items-center justify-between gap-2 flex-wrap"><span className="flex items-center gap-2"><Component className="w-5 h-5 text-purple-600"/>{item.component_code}</span><Badge className="bg-purple-50 text-purple-700 border-0">Cylinder Head</Badge></CardTitle></CardHeader><CardContent className="space-y-3"><div className="grid sm:grid-cols-2 gap-3 text-sm"><div><Label className="text-xs text-slate-500">Pairing</Label><p>{engine?<>Paired to <span className="font-mono font-semibold">{engine.eed_id}</span> · {engine.engine_serial_number}</>:<>Currently unpaired</>}</p></div><div><Label className="text-xs text-slate-500">Head location</Label><p className="flex items-center gap-1"><MapPin className="w-3.5 h-3.5 text-slate-400"/>{item.storage_location||'—'}</p></div></div><div className="flex flex-wrap gap-2">{job&&<><Button className="bg-[#e20404] hover:bg-red-700" onClick={()=>navigate(`/JobCard?id=${job.id}&tab=work&work=machining`)}><Wrench className="w-4 h-4 mr-1"/>Machining</Button><Button variant="outline" onClick={()=>navigate(`/JobCard?id=${job.id}&tab=work&work=verify`)}><ShieldCheck className="w-4 h-4 mr-1"/>Verify Components</Button><Button variant="outline" onClick={()=>navigate(`/JobCard?id=${job.id}&tab=findings`)}><ClipboardList className="w-4 h-4 mr-1"/>Findings</Button></>}<Button variant="outline" onClick={()=>setMoveOpen(true)}><MapPin className="w-4 h-4 mr-1"/>Move Head</Button>{engine&&<Button variant="ghost" onClick={()=>navigate(`/CustomerDetail?id=${engine.customer_id}`)}>Paired Engine</Button>}</div></CardContent></Card><ScanMoveLocationDialog open={moveOpen} onClose={()=>setMoveOpen(false)} title={`Move ${item.component_code}`} currentLocation={item.storage_location||''} onConfirm={move} busy={moving}/></>;
}
