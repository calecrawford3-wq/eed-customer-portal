import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Loader2, PlayCircle } from "lucide-react";
import { toast } from "sonner";

export const TEST_OFFER_NUMBER = "EAO-2026-1002";

// Admin-only entry point into the isolated walkthrough, rendered on the regular
// offer page for the test offer only. It never starts a real payment, identity
// check or signature: the server refuses session creation to anyone who is not
// an authenticated admin.
export default function TestWalkthroughStart({ offer, compact = false }) {
  const navigate = useNavigate();
  const [access, setAccess] = useState("checking");
  const [busy, setBusy] = useState(false);
  const isTestOffer = offer?.offer_number === TEST_OFFER_NUMBER;

  useEffect(() => {
    if (!isTestOffer) return undefined;
    let live = true;
    base44.auth.me()
      .then((user) => { if (live) setAccess(user?.role === "admin" ? "admin" : "not_admin"); })
      .catch(() => { if (live) setAccess("signed_out"); });
    return () => { live = false; };
  }, [isTestOffer]);

  if (!isTestOffer) return null;

  const start = async () => {
    if (!offer?.id) {
      toast.error("Reload this page, then start the test walkthrough.");
      return;
    }
    setBusy(true);
    try {
      const res = await base44.functions.invoke("engineAssistanceDemo", { action: "create", offer_id: offer.id });
      if (res.data?.error) throw new Error(res.data.error);
      if (!res.data?.token) throw new Error("The test link could not be created");
      // Same tab on purpose: mobile Safari blocks popups opened after an await.
      navigate(`/engine-assistance/demo/${res.data.token}`);
    } catch (error) {
      toast.error(error?.message || "The test walkthrough could not be started");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className={`rounded-2xl border-2 border-amber-400 bg-amber-50 ${compact ? "p-3" : "p-4"} space-y-3`}>
      <div className="flex items-start gap-2">
        <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-700" />
        <div className="min-w-0">
          <p className="text-xs font-extrabold uppercase leading-snug tracking-wide text-amber-900">
            TEST MODE — no real payment, verification or legally binding signature
          </p>
          <p className="mt-1 text-[11px] leading-relaxed text-amber-900">
            {compact
              ? "Real financing stays locked here. The test walkthrough runs this same deposit plan end to end."
              : `Offer ${offer.offer_number} runs the whole deposit plan — simulated identity, Elite review, agreement, autopay and deposit — in an isolated test. Nothing is charged, verified or signed into effect.`}
          </p>
        </div>
      </div>

      {access === "admin" ? (
        <Button className="w-full" disabled={busy} onClick={start}>
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
          Start complete TEST walkthrough
        </Button>
      ) : access === "checking" ? (
        <p className="flex items-center gap-1.5 text-[11px] text-amber-900">
          <Loader2 className="h-3.5 w-3.5 animate-spin" /> Checking access…
        </p>
      ) : (
        <p className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-[11px] font-medium leading-relaxed text-amber-900">
          Sign in as Elite admin to start test. The button never charges, verifies or signs anything for a customer.
        </p>
      )}
    </div>
  );
}