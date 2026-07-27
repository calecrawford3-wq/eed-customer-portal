import React, { useRef, useState } from "react";
import { base44 } from "@/api/base44Client";
import { Button } from "@/components/ui/button";
import { Upload, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function DynoSheetUploader({ buildId, specSheetId, role = "admin", onUploaded }) {
  const inputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const handleFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file || (!buildId && !specSheetId)) return;
    setUploading(true);
    try {
      const res = await base44.integrations.Core.UploadFile({ file });
      const file_url = res.file_url;
      const isPdf = file.name.toLowerCase().endsWith(".pdf");
      await base44.functions.invoke("uploadDynoSheet", {
        build_id: buildId || "",
        spec_sheet_id: specSheetId || "",
        file_url,
        filename: file.name,
        file_type: isPdf ? "pdf" : "image",
      });
      toast.success("Dyno sheet uploaded — marked as current");
      onUploaded?.();
    } catch (err) {
      toast.error("Upload failed: " + (err?.message || "error"));
    } finally {
      setUploading(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  return (
    <>
      <input
        ref={inputRef}
        type="file"
        accept="image/*,application/pdf"
        className="hidden"
        onChange={handleFile}
      />
      <Button
        size="sm"
        variant="outline"
        disabled={uploading}
        onClick={() => inputRef.current?.click()}
      >
        {uploading ? (
          <><Loader2 className="w-3.5 h-3.5 mr-1 animate-spin" />Uploading…</>
        ) : (
          <><Upload className="w-3.5 h-3.5 mr-1" />Upload Dyno Sheet</>
        )}
      </Button>
    </>
  );
}