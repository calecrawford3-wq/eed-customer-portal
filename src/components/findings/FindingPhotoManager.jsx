import React, { useState, useRef, useCallback, useEffect } from "react";
import { base44 } from "@/api/base44Client";
import { compressImage } from "@/lib/compressImage";
import { ensureDisplayableUrl, isHeicUrl } from "@/lib/heicUtils";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Upload, X, Loader2, RotateCw, Star, Eye, EyeOff, Camera, AlertCircle } from "lucide-react";
import { toast } from "sonner";

const MAX_BYTES = 1300 * 1024; // ~1.3MB — enough detail for damage inspection, fast on mobile

/**
 * Manages finding photos: phone-camera/upload capture, compression, per-file
 * upload progress, failed-upload retry, captions, cover selection, and a
 * per-photo "Share with customer" toggle (defaults to internal).
 *
 * Photos are uploaded to PRIVATE storage (UploadPrivateFile). The parent
 * persists FindingPhoto records on save. Form text lives in the parent and
 * is never touched by uploads, so a failed upload never loses entered text.
 *
 * Slot shape (internal):
 *  { id, file_uri, caption, share_with_customer, is_cover, sort_order,
 *    _status: 'uploaded'|'uploading'|'failed', _progress, _file, _localUrl, _signedUrl, _isNew }
 */
export default function FindingPhotoManager({ existingPhotos = [], onChange }) {
  const [slots, setSlots] = useState(() =>
    (existingPhotos || []).map((p) => ({
      id: p.id,
      file_uri: p.file_uri,
      caption: p.caption || "",
      share_with_customer: !!p.share_with_customer,
      is_cover: !!p.is_cover,
      sort_order: Number(p.sort_order) || 0,
      _status: "uploaded",
      _signedUrl: p.signed_url || "",
      _isNew: false,
    }))
  );
  const [busyCount, setBusyCount] = useState(0);
  const [signedUrlOverrides, setSignedUrlOverrides] = useState({}); // original -> converted for HEIC
  const fileInputRef = useRef(null);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  // Convert HEIC signed URLs for existing photos so they display in-browser
  useEffect(() => {
    let cancelled = false;
    for (const s of slots) {
      const url = s._signedUrl;
      if (!url || !isHeicUrl(url) || signedUrlOverrides[url]) continue;
      ensureDisplayableUrl(url).then((converted) => {
        if (!cancelled && converted && converted !== url) {
          setSignedUrlOverrides((prev) => ({ ...prev, [url]: converted }));
        }
      });
    }
    return () => { cancelled = true; };
  }, [slots, signedUrlOverrides]);

  // Sync initial slots to the parent on mount so the parent always knows the
  // current photo set (prevents accidental deletion of untouched existing photos on save).
  const initialSlotsRef = useRef(slots);
  useEffect(() => { onChangeRef.current?.(initialSlotsRef.current); }, []);

  const emit = useCallback((next) => {
    setSlots(next);
    onChange?.(next);
  }, [onChange]);

  const uploadOne = async (slot, file) => {
    let compressed = file;
    try {
      compressed = await compressImage(file, MAX_BYTES);
    } catch (e) {
      // If compression fails, fall back to the original file
      console.warn("compression failed, uploading original", e?.message);
    }
    try {
      const { file_uri } = await base44.integrations.Core.UploadPrivateFile({ file: compressed });
      if (!file_uri) throw new Error("No file_uri returned");
      return { file_uri, ok: true };
    } catch (e) {
      return { file_uri: null, ok: false, error: e?.message || "Upload failed" };
    }
  };

  const addFiles = async (fileList) => {
    const files = Array.from(fileList || []);
    if (!files.length) return;
    const startIndex = slots.length;
    const newSlots = files.map((file, i) => ({
      id: null,
      file_uri: null,
      caption: "",
      share_with_customer: false, // default internal
      is_cover: false,
      sort_order: startIndex + i,
      _status: "uploading",
      _file: file,
      _localUrl: URL.createObjectURL(file),
      _isNew: true,
    }));
    const next = [...slots, ...newSlots];
    emit(next);
    setBusyCount((c) => c + files.length);

    for (let i = 0; i < files.length; i++) {
      const slotIdx = startIndex + i;
      const res = await uploadOne(newSlots[i], files[i]);
      setSlots((cur) => {
        const upd = [...cur];
        if (res.ok) {
          upd[slotIdx] = { ...upd[slotIdx], file_uri: res.file_uri, _status: "uploaded" };
        } else {
          upd[slotIdx] = { ...upd[slotIdx], _status: "failed" };
          toast.error(`Upload failed: ${files[i].name}`);
        }
        onChange?.(upd);
        return upd;
      });
      setBusyCount((c) => Math.max(0, c - 1));
    }
  };

  const retry = async (idx) => {
    const slot = slots[idx];
    if (!slot?._file) return;
    setSlots((cur) => {
      const upd = [...cur];
      upd[idx] = { ...upd[idx], _status: "uploading" };
      onChange?.(upd);
      return upd;
    });
    setBusyCount((c) => c + 1);
    const res = await uploadOne(slot, slot._file);
    setSlots((cur) => {
      const upd = [...cur];
      if (res.ok) {
        upd[idx] = { ...upd[idx], file_uri: res.file_uri, _status: "uploaded" };
      } else {
        upd[idx] = { ...upd[idx], _status: "failed" };
        toast.error("Retry failed");
      }
      onChange?.(upd);
      return upd;
    });
    setBusyCount((c) => Math.max(0, c - 1));
  };

  const remove = (idx) => {
    const slot = slots[idx];
    if (slot?._localUrl) URL.revokeObjectURL(slot._localUrl);
    emit(slots.filter((_, i) => i !== idx));
  };

  const patch = (idx, changes) => {
    const next = slots.map((s, i) => (i === idx ? { ...s, ...changes } : s));
    emit(next);
  };

  const setCover = (idx) => {
    const next = slots.map((s, i) => ({ ...s, is_cover: i === idx }));
    emit(next);
  };

  const uploadedCount = slots.filter((s) => s._status === "uploaded").length;
  const sharedCount = slots.filter((s) => s.share_with_customer && s._status === "uploaded").length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs text-slate-500">
          {slots.length} photo{slots.length === 1 ? "" : "s"} · {sharedCount} shared with customer
        </span>
        {busyCount > 0 && (
          <span className="text-xs text-[#e20404] flex items-center gap-1">
            <Loader2 className="w-3 h-3 animate-spin" /> Uploading {busyCount}…
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
        {slots.map((slot, idx) => (
          <div key={idx} className="relative rounded-lg border border-slate-200 overflow-hidden bg-slate-50">
            <div className="aspect-square relative">
              {slot._status === "uploading" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-100/80 z-10">
                  <Loader2 className="w-5 h-5 animate-spin text-[#e20404]" />
                  <span className="text-[10px] text-slate-500 mt-1">Uploading…</span>
                </div>
              )}
              {slot._status === "failed" && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-red-50/90 z-10 p-1 text-center">
                  <AlertCircle className="w-5 h-5 text-red-500" />
                  <span className="text-[10px] text-red-600 mt-1">Upload failed</span>
                  <Button size="sm" variant="outline" className="h-6 mt-1 text-[10px]" onClick={() => retry(idx)}>
                    <RotateCw className="w-3 h-3 mr-1" /> Retry
                  </Button>
                </div>
              )}
              {(slot._localUrl || slot._signedUrl) && (
                <img
                  src={slot._localUrl || signedUrlOverrides[slot._signedUrl] || slot._signedUrl}
                  alt={slot.caption || "Finding photo"}
                  className="w-full h-full object-cover"
                />
              )}
              {slot.is_cover && slot._status === "uploaded" && (
                <span className="absolute top-1 left-1 bg-amber-400 text-amber-900 text-[9px] font-bold px-1.5 py-0.5 rounded flex items-center gap-0.5">
                  <Star className="w-2.5 h-2.5 fill-current" /> COVER
                </span>
              )}
              <button
                type="button"
                onClick={() => remove(idx)}
                className="absolute top-1 right-1 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-black/80"
              >
                <X className="w-3 h-3" />
              </button>
            </div>
            <div className="p-1.5 space-y-1">
              <Input
                value={slot.caption}
                onChange={(e) => patch(idx, { caption: e.target.value })}
                placeholder="Caption"
                className="h-7 text-xs"
              />
              <div className="flex items-center justify-between gap-1">
                <button
                  type="button"
                  onClick={() => patch(idx, { share_with_customer: !slot.share_with_customer })}
                  className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded ${slot.share_with_customer ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}
                  title={slot.share_with_customer ? "Shared with customer" : "Internal only"}
                >
                  {slot.share_with_customer ? <Eye className="w-3 h-3" /> : <EyeOff className="w-3 h-3" />}
                  {slot.share_with_customer ? "Shared" : "Internal"}
                </button>
                <button
                  type="button"
                  onClick={() => setCover(idx)}
                  className={`flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded ${slot.is_cover ? "bg-amber-100 text-amber-700" : "bg-slate-100 text-slate-500"}`}
                  title="Set as cover photo"
                >
                  <Star className={`w-3 h-3 ${slot.is_cover ? "fill-current" : ""}`} />
                  Cover
                </button>
              </div>
            </div>
          </div>
        ))}

        <label className="aspect-square rounded-lg border-2 border-dashed border-slate-300 flex flex-col items-center justify-center cursor-pointer hover:border-[#e20404] hover:bg-red-50/30 transition-colors text-slate-400">
          <Camera className="w-6 h-6 mb-1" />
          <span className="text-xs font-medium text-slate-500">Add photos</span>
          <span className="text-[10px] text-slate-400">camera or upload</span>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            multiple
            capture="environment"
            className="hidden"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ""; }}
          />
        </label>
      </div>
      <p className="text-[11px] text-slate-400">
        New photos default to <strong>Internal</strong>. Toggle <strong>Shared</strong> to show a photo to the customer in the portal and approval link. Photos are compressed for fast loading.
      </p>
    </div>
  );
}