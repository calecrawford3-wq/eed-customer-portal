import React, { useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Upload, X, ImageIcon, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function CorePhotoManager({ photos, onChange, readOnly }) {
  const list = Array.isArray(photos) ? photos : [];
  const [uploading, setUploading] = useState(false);
  const [viewer, setViewer] = useState(null);

  const handleUpload = async (e) => {
    const files = Array.from(e.target.files || []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      const urls = [];
      for (const file of files) {
        const { file_url } = await base44.integrations.Core.UploadFile({ file });
        if (file_url) urls.push(file_url);
      }
      onChange([...list, ...urls]);
      toast.success(urls.length > 1 ? `${urls.length} photos added` : "Photo added");
    } catch (err) {
      toast.error("Upload failed");
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  const removePhoto = (idx) => {
    onChange(list.filter((_, i) => i !== idx));
  };

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {list.map((url, idx) => (
          <div key={idx} className="relative group w-20 h-20 rounded-lg overflow-hidden border border-slate-200 bg-slate-50">
            <img src={url} alt={`Core photo ${idx + 1}`} className="w-full h-full object-cover cursor-pointer" onClick={() => setViewer(url)} />
            {!readOnly && (
              <button type="button" onClick={() => removePhoto(idx)} className="absolute top-0.5 right-0.5 bg-black/60 text-white rounded-full w-5 h-5 flex items-center justify-center hover:bg-red-600 opacity-0 group-hover:opacity-100 transition-opacity">
                <X className="w-3 h-3" />
              </button>
            )}
          </div>
        ))}
        {list.length === 0 && (
          <div className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-200 flex items-center justify-center text-slate-300">
            <ImageIcon className="w-6 h-6" />
          </div>
        )}
        {!readOnly && (
          <label className="w-20 h-20 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center cursor-pointer hover:border-[#e20404] hover:bg-red-50 transition-colors">
            {uploading ? <Loader2 className="w-5 h-5 text-slate-400 animate-spin" /> : <Upload className="w-5 h-5 text-slate-400" />}
            <Input type="file" accept="image/*" multiple className="hidden" onChange={handleUpload} disabled={uploading} />
          </label>
        )}
      </div>
      {list.length === 0 && !readOnly && (
        <p className="text-xs text-slate-400 mt-1.5">Add photos of the core so you can reference its condition without opening the box.</p>
      )}

      <Dialog open={!!viewer} onOpenChange={() => setViewer(null)}>
        <DialogContent className="max-w-3xl p-0 bg-black/95 border-0">
          <DialogTitle className="sr-only">Core photo</DialogTitle>
          {viewer && <img src={viewer} alt="Core photo" className="w-full max-h-[85vh] object-contain" />}
        </DialogContent>
      </Dialog>
    </div>
  );
}