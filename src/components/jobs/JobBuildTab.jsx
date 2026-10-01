import React, { useState } from "react";
import { Link } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Wrench, FileText, Pencil, Save, X } from "lucide-react";
import { toast } from "sonner";

export default function JobBuildTab({ job, build, platform }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [valveLashIntake, setValveLashIntake] = useState(build?.valve_lash_intake || {});
  const [valveLashExhaust, setValveLashExhaust] = useState(build?.valve_lash_exhaust || {});
  const [camInfo, setCamInfo] = useState(build?.cam_info || {});

  if (!build) {
    return (
      <Card className="border-0 shadow-sm">
        <CardContent>
          <p className="text-sm text-slate-400 py-8 text-center">No build linked yet. The build is created when the job is activated (estimate approved + deposit received).</p>
        </CardContent>
      </Card>
    );
  }

  const hasMeasurements = build.valve_lash_intake || build.valve_lash_exhaust || build.internal_measurements || build.cam_info;

  const startEdit = () => {
    setValveLashIntake(build.valve_lash_intake || {});
    setValveLashExhaust(build.valve_lash_exhaust || {});
    setCamInfo(build.cam_info || {});
    setEditing(true);
  };

  const saveMeasurements = async () => {
    setSaving(true);
    try {
      await base44.entities.EngineBuild.update(build.id, {
        valve_lash_intake: valveLashIntake,
        valve_lash_exhaust: valveLashExhaust,
        cam_info: camInfo,
      });
      qc.invalidateQueries({ queryKey: ["job-linked", "EngineBuild", job.build_id] });
      qc.invalidateQueries({ queryKey: ["build", build.id] });
      toast.success("Measurements saved");
      setEditing(false);
    } catch (e) {
      toast.error("Failed to save: " + e.message);
    }
    setSaving(false);
  };

  const setValve = (setFn, side, num, value) => {
    setFn(prev => ({ ...prev, [`valve_${num}`]: value }));
  };

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Build Sheet</CardTitle>
            <div className="flex items-center gap-2">
              {editing ? (
                <>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)} disabled={saving}><X className="w-3.5 h-3.5 mr-1" /> Cancel</Button>
                  <Button size="sm" className="bg-[#e20404] hover:bg-[#c00303]" onClick={saveMeasurements} disabled={saving}><Save className="w-3.5 h-3.5 mr-1" /> {saving ? "Saving..." : "Save"}</Button>
                </>
              ) : (
                <>
                  <Button size="sm" variant="outline" onClick={startEdit}><Pencil className="w-3.5 h-3.5 mr-1" /> Edit Measurements</Button>
                  <Link to={`/BuildDetail?id=${build.id}`}><Button variant="outline" size="sm"><FileText className="w-3.5 h-3.5 mr-1" /> Open Build Detail</Button></Link>
                </>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-3 text-sm">
          <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
            <Field label="Serial" value={<span className="font-mono">{build.engine_serial_number}</span>} />
            <Field label="EED ID" value={<span className="font-mono text-[#e20404]">{build.eed_id}</span>} />
            <Field label="Platform" value={platform ? `${platform.manufacturer} ${platform.name}` : "—"} />
            <Field label="Status" value={<Badge variant="outline" className="capitalize">{(build.status || "").replace("_", " ")}</Badge>} />
            <Field label="Work Tag" value={<Badge variant="outline" className="capitalize">{(build.work_tag || "none").replace("_", " ")}</Badge>} />
            <Field label="Location" value={build.storage_location || "—"} />
            <Field label="Max RPM" value={build.max_rpm || "—"} />
            <Field label="Oil" value={build.oil_recommendation || "—"} />
            <Field label="Refresh" value={build.refresh_interval || "—"} />
          </div>
        </CardContent>
      </Card>

      {editing ? (
        <>
          {/* Inline valve lash editing */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Valve Lash — Intake</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {[1,2,3,4,5,6,7,8].map(n => (
                  <div key={n}>
                    <Label className="text-[10px] text-slate-400">V{n}</Label>
                    <Input
                      value={valveLashIntake[`valve_${n}`] || ""}
                      onChange={e => setValve(setValveLashIntake, "intake", n, e.target.value)}
                      placeholder="0.000"
                      className="text-center h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Valve Lash — Exhaust</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
                {[1,2,3,4,5,6,7,8].map(n => (
                  <div key={n}>
                    <Label className="text-[10px] text-slate-400">V{n}</Label>
                    <Input
                      value={valveLashExhaust[`valve_${n}`] || ""}
                      onChange={e => setValve(setValveLashExhaust, "exhaust", n, e.target.value)}
                      placeholder="0.000"
                      className="text-center h-8 text-sm"
                    />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Inline cam editing */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2"><CardTitle className="text-sm">Cam Timing</CardTitle></CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Intake</Label>
                  <div className="flex gap-2">
                    <Select value={camInfo.intake_direction || ""} onValueChange={v => setCamInfo(p => ({ ...p, intake_direction: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Direction" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="retarded">Retarded</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={camInfo.intake_degrees || ""}
                      onChange={e => setCamInfo(p => ({ ...p, intake_degrees: Number(e.target.value) }))}
                      placeholder="Degrees"
                      className="h-8 w-24 text-center text-sm"
                      min="1" max="6"
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs font-semibold">Exhaust</Label>
                  <div className="flex gap-2">
                    <Select value={camInfo.exhaust_direction || ""} onValueChange={v => setCamInfo(p => ({ ...p, exhaust_direction: v }))}>
                      <SelectTrigger className="h-8 text-xs"><SelectValue placeholder="Direction" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="advanced">Advanced</SelectItem>
                        <SelectItem value="retarded">Retarded</SelectItem>
                      </SelectContent>
                    </Select>
                    <Input
                      type="number"
                      value={camInfo.exhaust_degrees || ""}
                      onChange={e => setCamInfo(p => ({ ...p, exhaust_degrees: Number(e.target.value) }))}
                      placeholder="Degrees"
                      className="h-8 w-24 text-center text-sm"
                      min="1" max="6"
                    />
                  </div>
                </div>
              </div>
              <p className="text-xs text-slate-400 mt-2">For internal measurements (bearing clearances, compression, etc.), use the full Build Detail page.</p>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Measurements</CardTitle></CardHeader>
          <CardContent>
            {!hasMeasurements ? (
              <p className="text-sm text-slate-400 py-4">No measurements recorded yet. Click "Edit Measurements" to record valve lash and cam timing, or open the build detail for full measurement entry.</p>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
                {build.valve_lash_intake && <Field label="Valve Lash (Intake)" value={<ValveLashSummary data={build.valve_lash_intake} />} />}
                {build.valve_lash_exhaust && <Field label="Valve Lash (Exhaust)" value={<ValveLashSummary data={build.valve_lash_exhaust} />} />}
                {build.cam_info && <Field label="Cam (Intake)" value={build.cam_info.intake_direction ? `${build.cam_info.intake_direction} ${build.cam_info.intake_degrees}°` : "—"} />}
                {build.cam_info && <Field label="Cam (Exhaust)" value={build.cam_info.exhaust_direction ? `${build.cam_info.exhaust_direction} ${build.cam_info.exhaust_degrees}°` : "—"} />}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {build.assembly_notes && (
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2"><CardTitle className="text-sm">Assembly Notes</CardTitle></CardHeader>
          <CardContent><p className="text-sm text-slate-600 whitespace-pre-wrap">{build.assembly_notes}</p></CardContent>
        </Card>
      )}
    </div>
  );
}

function ValveLashSummary({ data }) {
  const valves = Object.entries(data || {}).filter(([, v]) => v).map(([k, v]) => v);
  if (valves.length === 0) return "—";
  return <span className="text-xs">{valves.join(" / ")}</span>;
}

function Field({ label, value }) {
  return <div><p className="text-[10px] uppercase text-slate-400 font-semibold">{label}</p><p className="text-slate-900">{value}</p></div>;
}