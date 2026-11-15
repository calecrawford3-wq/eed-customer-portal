import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Checkbox } from "@/components/ui/checkbox";
import { Hammer, Wrench, Loader2, ExternalLink, ClipboardList } from "lucide-react";
import { format } from "date-fns";
import { formatMoney } from "@/lib/money";

export default function BuildJobPanel({ application, build, job, platforms = [], offer, onAction, busy }) {
  const [platformId, setPlatformId] = useState(application.platform_id || "");
  const [serial, setSerial] = useState(build?.engine_serial_number || "");
  const [authorized, setAuthorized] = useState(false);
  const canBuild = ["approved", "funded"].includes(application.status);
  const balance = Number(offer?.balance_due ?? offer?.amount_due ?? 0);
  const paid = offer && (offer.status === "paid" || Number(offer?.paid_amount) > 0);
  const platformName = (id) => platforms.find((p) => p.id === id)?.name || "";

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base"><Hammer className="h-4 w-4 text-[#e20404]" /> Build and shop job</CardTitle>
        <p className="text-xs text-slate-500">The engine build is created from the approved application. The normal shop job opens only once the offer is paid or an admin authorizes it.</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {!build && (
          canBuild ? (
            <div className="space-y-2">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div>
                  <Label className="text-xs">Engine platform</Label>
                  <Select value={platformId} onValueChange={setPlatformId}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Choose platform" /></SelectTrigger>
                    <SelectContent>
                      {platforms.map((platform) => (
                        <SelectItem key={platform.id} value={platform.id}>{platform.manufacturer} {platform.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label className="text-xs">Engine serial number</Label>
                  <Input className="mt-1" value={serial} onChange={(e) => setSerial(e.target.value)} placeholder="Serial on the case" />
                </div>
              </div>
              <Button size="sm" disabled={busy || !serial.trim()} onClick={() => onAction("create_build", { application_id: application.id, platform_id: platformId, engine_serial_number: serial })}>
                {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wrench className="h-4 w-4" />} Create engine build
              </Button>
            </div>
          ) : (
            <p className="text-sm text-slate-500">Approve the application before creating its engine build.</p>
          )
        )}

        {build && (
          <div className="rounded-xl border border-slate-200 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-slate-900">Build {build.build_number || build.engine_serial_number}</p>
                <p className="text-xs text-slate-500">
                  Serial {build.engine_serial_number}
                  {platformName(build.platform_id) ? ` · ${platformName(build.platform_id)}` : ""}
                  {build.status ? ` · ${build.status}` : ""}
                </p>
                {build.created_date && <p className="text-[11px] text-slate-400">Created {format(new Date(build.created_date), "MMM d, yyyy")}</p>}
              </div>
              <Button size="sm" variant="outline" asChild>
                <Link to={`/BuildDetail?id=${build.id}`}><ExternalLink className="h-4 w-4" /> Open</Link>
              </Button>
            </div>
          </div>
        )}

        {build && !job && (
          <div className="space-y-2">
            <div className="flex items-start gap-2">
              <Checkbox id="authorize-job" checked={authorized} onCheckedChange={(v) => setAuthorized(v === true)} />
              <label htmlFor="authorize-job" className="text-xs text-slate-600">
                I authorize opening the shop job before payment. Leave unchecked to wait for the customer's payment.
              </label>
            </div>
            <Button
              size="sm"
              disabled={busy || (!paid && !authorized)}
              onClick={() => onAction("create_job", { offer_id: offer?.id, authorized })}
            >
              <ClipboardList className="h-4 w-4" /> Open shop job
            </Button>
            {!paid && <p className="text-[11px] text-slate-500">Balance {formatMoney(balance)} · jobs normally open automatically when the offer is paid.</p>}
          </div>
        )}

        {job && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-sm font-semibold text-emerald-900">Job {job.job_number}</p>
                <p className="text-xs text-emerald-800">{job.stage ? String(job.stage).replace(/_/g, " ") : "queued"}{job.is_active ? " · active" : ""}</p>
              </div>
              <Button size="sm" variant="outline" asChild><Link to={`/JobCard?id=${job.id}`}><ExternalLink className="h-4 w-4" /> Open job</Link></Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}