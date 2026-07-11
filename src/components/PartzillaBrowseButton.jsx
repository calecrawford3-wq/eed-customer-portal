import React from "react";
import { Button } from "@/components/ui/button";
import { ExternalLink } from "lucide-react";

const PARTZILLA_URL = "https://www.partzilla.com/catalog";

export default function PartzillaBrowseButton({ label = "Browse Catalog", size = "sm", className = "" }) {
  return (
    <a href={PARTZILLA_URL} target="_blank" rel="noopener noreferrer" className="inline-block">
      <Button type="button" variant="outline" size={size} className={className}>
        <ExternalLink className="w-3.5 h-3.5 mr-1.5" /> {label}
      </Button>
    </a>
  );
}