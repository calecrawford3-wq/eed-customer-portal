import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Loader2 } from "lucide-react";

// Affirmative e-signature block. Three separate affirmative acts are required:
// consent to sign electronically, confirmation that the agreement was read and
// accepted, and a typed legal name. Autopay is never bundled in.
export default function AgreementSignatureForm({ onSubmit, busy, disabledReason = "" }) {
  const [name, setName] = useState("");
  const [esign, setEsign] = useState(false);
  const [accept, setAccept] = useState(false);

  const ready = name.trim().length >= 2 && esign && accept && !disabledReason;

  return (
    <div className="space-y-2">
      {disabledReason ? (
        <p className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">{disabledReason}</p>
      ) : null}
      <Input
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="Type your full legal name to sign"
        disabled={!!disabledReason}
        autoComplete="name"
      />
      <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
        <Checkbox checked={esign} onCheckedChange={(value) => setEsign(value === true)} className="mt-0.5" disabled={!!disabledReason} />
        <span>I agree to receive and sign this agreement electronically. I understand my typed name, the time, the document hash and my browser details are recorded as my signature.</span>
      </label>
      <label className="flex items-start gap-2 text-[11px] leading-relaxed text-slate-600">
        <Checkbox checked={accept} onCheckedChange={(value) => setAccept(value === true)} className="mt-0.5" disabled={!!disabledReason} />
        <span>I read the Retail Installment Agreement, including the amount financed, APR, finance charge, total of payments, payment schedule, late fee, right to cure and privacy sections, and I accept it.</span>
      </label>
      <Button
        className="w-full"
        disabled={!ready || !!busy}
        onClick={() => onSubmit({ name: name.trim(), esign_consent: true, accept_terms: true })}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null} Sign and accept agreement
      </Button>
    </div>
  );
}