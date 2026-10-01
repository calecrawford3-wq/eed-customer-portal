import React from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Wrench, FileText, MapPin } from "lucide-react";

export default function JobBuildTab({ job, build, platform }) {
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

  return (
    <div className="space-y-4">
      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm flex items-center gap-2"><Wrench className="w-4 h-4" /> Build Sheet</CardTitle>
            <Link to={`/BuildDetail?id=${build.id}`}><Button variant="outline" size="sm"><FileText className="w-3.5 h-3.5 mr-1" /> Open Build Detail</Button></Link>
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

      <Card className="border-0 shadow-sm">
        <CardHeader className="pb-2"><CardTitle className="text-sm">Measurements</CardTitle></CardHeader>
        <CardContent>
          {!hasMeasurements ? (
            <p className="text-sm text-slate-400 py-4">No measurements recorded yet. Open the build detail to record valve lash, bearing clearances, and compression.</p>
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