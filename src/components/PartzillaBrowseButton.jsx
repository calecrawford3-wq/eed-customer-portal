import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { Search } from "lucide-react";
import PartzillaBrowser from "@/components/PartzillaBrowser";

export default function PartzillaBrowseButton({ label = "Browse Catalog", size = "sm", className = "", onImported }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button type="button" variant="outline" size={size} className={className} onClick={() => setOpen(true)}>
        <Search className="w-3.5 h-3.5 mr-1.5" /> {label}
      </Button>
      <PartzillaBrowser open={open} onOpenChange={setOpen} onImported={onImported} />
    </>
  );
}