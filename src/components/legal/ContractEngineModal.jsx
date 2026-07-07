import React, { useState, useRef } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { FileText, Loader2, Upload, X, Image } from "lucide-react";
import { base44 } from "@/api/base44Client";
import { toast } from "sonner";
import SignaturePad from "@/components/SignaturePad";

const CONTRACT_ENGINE_BODY = `ELITE ENGINE DEVELOPMENT
CONTRACT ENGINE RESEARCH, INTELLECTUAL PROPERTY, AND USE AGREEMENT

This Agreement (the "Contract") is entered into by and between Elite Developments USA LLC DBA Elite Engine Development, hereinafter referred to as "Seller," and the Buyer identified herein.

1. DESCRIPTION OF ENGINE
Engine Type/Model, Serial Number(s), EED Build Number(s), and Seal Tag Number(s) are recorded at time of signing.

2. PURPOSE OF THE AGREEMENT
2.1 This Agreement protects Seller's research, development methods, performance enhancements, trade secret processes, proprietary configuration strategies, and confidential testing data implemented within the Engine.
2.2 Buyer acknowledges that the Engine incorporates research and development elements requiring protection to preserve Seller's competitive advantage and intellectual property interests.

3. OWNERSHIP AND INTELLECTUAL PROPERTY
3.1 Buyer retains ownership of the physical Engine assembly.
3.2 The following remain the exclusive property of Seller: (a) proprietary preparation and assembly methods; (b) machining processes and configuration strategies; (c) component selection logic and tolerancing methods; (d) performance characteristics and development data; (e) research and development elements embodied within the Engine.
3.3 Buyer shall not remove, alter, obscure, or tamper with any Seal, identification marking, internal marking, or proprietary indicator placed by Seller.
3.4 Buyer shall not measure, blueprint, scan, reverse engineer, analyze, document, disclose, or otherwise attempt to replicate Seller's research, development methods, configuration strategies, or performance data.
3.5 Buyer remains responsible for any unauthorized access, inspection, teardown, modification, or disclosure performed by any third party while the Engine is under Buyer's custody or control.

4. SEAL INTEGRITY AND INSPECTION
4.1 The Engine shall be secured with tamper-evident Seals bearing unique identification numbers.
4.2 Seal removal shall be permitted solely by Seller.
4.3 Buyer shall not permit removal, cutting, alteration, or compromise of any Seal without Seller's prior authorization.
4.4 Unauthorized Seal removal, regardless of intent or purpose, shall constitute material breach of this Agreement.
4.5 Missing, compromised, altered, or unverifiable Seals shall create a rebuttable presumption of unauthorized access.

5. ENGINE SERVICE INTERVAL AND MANDATORY REBUILD
5.1 The Engine shall be returned to Seller for inspection and rebuild after twenty-five (25) race nights, or sooner if abnormal performance, damage, overheating, contamination, or operational concerns are observed.
5.2 Buyer shall not continue operating the Engine beyond this interval without Seller's written approval.
5.3 Failure to return the Engine for service within a reasonable period following the 25 race night interval may constitute material breach.

6. DATA OWNERSHIP
6.1 All performance data, durability observations, testing results, and research findings derived from the Engine remain the property of Seller.
6.2 Buyer shall not use the Engine for competitive benchmarking, comparative analysis, or development of competing engine programs.

7. BREACH AND REMEDIES
7.1 Breach shall result in liquidated damages of $12,500, which represents a reasonable estimate of harm and is not a penalty.
7.2 Seller shall recover enforcement costs including reasonable attorney's fees.
7.3 Buyer acknowledges that unauthorized access or disclosure may cause irreparable harm and agrees Seller shall be entitled to injunctive relief.

8. REBUILD PRIVILEGES
8.1 Buyer shall receive a fifteen percent (15%) rebuild discount applicable solely to the Engine covered by this Agreement, conditioned upon continued compliance with Seal integrity requirements.

9. TRANSFER AND CONTINUING OBLIGATIONS
9.1 Transfer of ownership requires Seller's written approval.
9.2 Any subsequent owner must assume this Agreement in writing.
9.3 Confidentiality, reverse engineering restrictions, and intellectual property protections survive resale, termination, or expiration unless expressly released by Seller.

10. LOSS, THEFT, OR DAMAGE
10.1 Buyer shall file a police report if the Engine is lost or stolen and notify Seller within 24 hours.
10.2 If the Engine is not recovered within 30 days, Buyer shall compensate Seller $3,000 for lost development value.

11. GOVERNING LAW
This Agreement shall be governed by the laws of the State of Oklahoma. Any action shall be brought exclusively in the county of Seller's principal place of business.

12. WAIVER OF JURY TRIAL
BUYER AND SELLER KNOWINGLY, VOLUNTARILY, AND INTENTIONALLY WAIVE ANY RIGHT TO TRIAL BY JURY IN ANY ACTION ARISING OUT OF OR RELATING TO THIS AGREEMENT OR THE ENGINE.

Seller Representative: Cale Crawford | Seller Contact: (918) 310-8532 | Seller Email: Cale@eedpower.com
`;

export default function ContractEngineModal({ open, onClose, onCreated, estimateId, invoiceId, customerId, buildId, customerEngineId, engineSerialNumber, customerName }) {
  const [sealTagNumbers, setSealTagNumbers] = useState("");
  const [photos, setPhotos] = useState([]); // [{url, name}]
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [adminSignature, setAdminSignature] = useState(null);
  const [saving, setSaving] = useState(false);
  const photoRef = useRef(null);

  const handlePhotoUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploadingPhoto(true);
    for (const file of files) {
      try {
        const res = await base44.integrations.Core.UploadFile({ file });
        const url = res?.file_url || res?.data?.file_url;
        if (url) setPhotos(prev => [...prev, { url, name: file.name }]);
      } catch (err) {
        toast.error(`Failed to upload ${file.name}`);
      }
    }
    setUploadingPhoto(false);
    e.target.value = "";
  };

  const removePhoto = (idx) => setPhotos(prev => prev.filter((_, i) => i !== idx));

  const handleConfirm = async () => {
    if (!adminSignature) {
      toast.error("Admin signature is required before creating the contract");
      return;
    }
    setSaving(true);
    try {
      const res = await base44.functions.invoke("createLegalDocument", {
        document_type: "contract_engine",
        title: "Contract Engine Research, Intellectual Property, and Use Agreement",
        body: CONTRACT_ENGINE_BODY,
        estimate_id: estimateId || null,
        invoice_id: invoiceId || null,
        customer_id: customerId,
        build_id: buildId || null,
        customer_engine_id: customerEngineId || null,
        seal_tag_numbers: sealTagNumbers,
        seal_tag_photos: photos.map(p => p.url),
        admin_signature: adminSignature,
        admin_signed_at: new Date().toISOString(),
        status: "pending_customer",
      });
      if (res?.data?.error) {
        toast.error(res.data.error);
      } else {
        toast.success("Contract Engine agreement created — customer will sign via the portal");
        if (onCreated) onCreated(res.data.legal_document);
        onClose();
        // Reset
        setSealTagNumbers("");
        setPhotos([]);
        setAdminSignature(null);
      }
    } catch (err) {
      const msg = err?.response?.data?.error || err?.message || "Failed to create document";
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-slate-900">
            <FileText className="w-5 h-5 text-blue-600" /> Contract Engine Agreement
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-5">
          {/* Engine info summary */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm">
            <p className="text-blue-800 font-medium">This contract will be generated for:</p>
            <p className="text-blue-700 mt-1">
              {customerName && <span className="font-semibold">{customerName}</span>}
              {engineSerialNumber && <span className="ml-2 font-mono text-blue-600">· {engineSerialNumber}</span>}
            </p>
            <p className="text-xs text-blue-600 mt-1">The customer will sign via the portal after you sign below.</p>
          </div>

          {/* Seal Tag Numbers */}
          <div>
            <Label className="text-sm font-medium">Seal Tag Numbers</Label>
            <Input
              className="mt-1"
              placeholder="e.g. 048346, 048347"
              value={sealTagNumbers}
              onChange={e => setSealTagNumbers(e.target.value)}
            />
            <p className="text-xs text-slate-400 mt-1">Enter all seal tag numbers applied to this engine (comma separated)</p>
          </div>

          {/* Photo Uploads */}
          <div>
            <Label className="text-sm font-medium">Seal Tag & Serial Number Photos</Label>
            <div className="mt-2 grid grid-cols-3 gap-2">
              {photos.map((p, i) => (
                <div key={i} className="relative group border border-slate-200 rounded-lg overflow-hidden bg-slate-50">
                  <img src={p.url} alt={p.name} className="w-full h-28 object-cover" />
                  <button
                    className="absolute top-1 right-1 bg-red-500 text-white rounded-full w-5 h-5 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
                    onClick={() => removePhoto(i)}
                  >
                    <X className="w-3 h-3" />
                  </button>
                  <p className="text-xs text-slate-400 truncate px-1 pb-1">{p.name}</p>
                </div>
              ))}
              <button
                className="border-2 border-dashed border-slate-200 rounded-lg h-28 flex flex-col items-center justify-center text-slate-400 hover:border-blue-300 hover:text-blue-500 transition-colors"
                onClick={() => photoRef.current?.click()}
                disabled={uploadingPhoto}
              >
                {uploadingPhoto ? <Loader2 className="w-5 h-5 animate-spin" /> : <Upload className="w-5 h-5 mb-1" />}
                <span className="text-xs">{uploadingPhoto ? "Uploading..." : "Add Photo"}</span>
              </button>
            </div>
            <input ref={photoRef} type="file" accept="image/*" multiple className="hidden" onChange={handlePhotoUpload} />
            <p className="text-xs text-slate-400 mt-1">Upload photos of each seal tag and the engine serial number plate</p>
          </div>

          {/* Agreement text */}
          <div>
            <Label className="text-sm font-medium">Agreement Text</Label>
            <div className="mt-1 bg-slate-50 border border-slate-200 rounded-lg p-4 max-h-48 overflow-y-auto">
              <pre className="text-xs text-slate-700 whitespace-pre-wrap font-sans">{CONTRACT_ENGINE_BODY}</pre>
            </div>
          </div>

          {/* Admin Signature */}
          <div>
            <Label className="text-sm font-medium">Your Signature (Seller — Required)</Label>
            <div className="mt-1 border border-slate-200 rounded-lg p-3 bg-white">
              {adminSignature ? (
                <div className="space-y-2">
                  <img src={adminSignature} alt="Admin signature" className="max-h-20 object-contain border border-slate-100 rounded p-1 bg-white" />
                  <Button size="sm" variant="outline" className="text-xs" onClick={() => setAdminSignature(null)}>Clear & Re-sign</Button>
                </div>
              ) : (
                <SignaturePad onChange={(sig) => setAdminSignature(sig)} />
              )}
            </div>
          </div>
        </div>

        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button
            className="bg-blue-600 hover:bg-blue-700 text-white"
            onClick={handleConfirm}
            disabled={saving || !adminSignature}
          >
            {saving ? <><Loader2 className="w-4 h-4 mr-1 animate-spin" /> Creating...</> : "Create Contract"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}