import React from "react";
import { Link } from "react-router-dom";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

const SPEC_TYPES = [
  { value: "stock", label: "Stock" },
  { value: "stage_1", label: "Stage 1" },
  { value: "stage_2", label: "Stage 2" },
  { value: "stage_3", label: "Stage 3" },
  { value: "contract", label: "Contract" },
  { value: "custom", label: "Custom" },
];

export default function BuildSpecsTab({ specSheet, getSpecTypeLabel }) {
  if (!specSheet) {
    return (
      <div className="text-center py-12">
        <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
        <h3 className="text-lg font-medium text-slate-900">No spec sheet assigned</h3>
        <p className="text-slate-500 mt-1">Assign a spec sheet to this build</p>
      </div>
    );
  }

  return (
    <Card className="border-0 shadow-sm">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="text-base">
            {specSheet.custom_name || getSpecTypeLabel(specSheet.spec_type)} Spec Sheet
          </CardTitle>
          <Link to={`/SpecView?id=${specSheet.id}`}>
            <Button variant="outline" size="sm">
              <FileText className="w-4 h-4 mr-2" />
              View Full Spec
            </Button>
          </Link>
        </div>
      </CardHeader>
      <CardContent>
        <div className="grid gap-4 md:grid-cols-2">
          {specSheet.specs?.block?.bore_diameter_mm && (
            <div className="flex justify-between py-2 border-b">
              <span className="text-slate-600">Bore Diameter</span>
              <span className="font-medium">{specSheet.specs.block.bore_diameter_mm} mm</span>
            </div>
          )}
          {specSheet.specs?.rotating_assembly?.stroke_mm && (
            <div className="flex justify-between py-2 border-b">
              <span className="text-slate-600">Stroke</span>
              <span className="font-medium">{specSheet.specs.rotating_assembly.stroke_mm} mm</span>
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}