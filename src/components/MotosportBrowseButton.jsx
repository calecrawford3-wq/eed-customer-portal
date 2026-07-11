import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";
import OemPartsBrowser from "@/components/OemPartsBrowser";

export default function MotosportBrowseButton({ label = "Browse MotoSport", size = "sm", className = "" }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> {label}
      </Button>
      <OemPartsBrowser open={open} onOpenChange={setOpen} />
    </>
  );
}