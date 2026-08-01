import React, { Suspense } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  FlaskConical,
  FileBarChart,
  BarChart2,
  Search,
  Sliders,
  GitCompare,
  Target,
  Database,
} from "lucide-react";
import LoadingState from "@/components/LoadingState";

const Simulator = React.lazy(() => import("@/pages/Simulator"));
const DynoImport = React.lazy(() => import("@/pages/DynoImport"));
const DynoComparison = React.lazy(() => import("@/pages/DynoComparison"));
const SimilarBuilds = React.lazy(() => import("@/pages/SimilarBuilds"));
const PredictionRules = React.lazy(() => import("@/pages/PredictionRules"));
const ControlledChanges = React.lazy(() => import("@/pages/ControlledChanges"));
const ModelAccuracy = React.lazy(() => import("@/pages/ModelAccuracy"));
const DevelopmentData = React.lazy(() => import("@/pages/DevelopmentData"));

const TABS = [
  { key: "simulator", label: "Simulator", icon: FlaskConical, Comp: Simulator },
  { key: "dyno-import", label: "Dyno Import", icon: FileBarChart, Comp: DynoImport },
  { key: "dyno-comparison", label: "Dyno Comparison", icon: BarChart2, Comp: DynoComparison },
  { key: "similar-builds", label: "Similar Builds", icon: Search, Comp: SimilarBuilds },
  { key: "prediction-rules", label: "Prediction Rules", icon: Sliders, Comp: PredictionRules },
  { key: "controlled-changes", label: "Controlled Changes", icon: GitCompare, Comp: ControlledChanges },
  { key: "model-accuracy", label: "Model Accuracy", icon: Target, Comp: ModelAccuracy },
  { key: "dev-data", label: "Dev Data Library", icon: Database, Comp: DevelopmentData },
];

export default function RnDEngineDeveloper() {
  const [searchParams, setSearchParams] = useSearchParams();
  const activeTab = searchParams.get("tab") || "simulator";

  const handleTabChange = (value) => {
    setSearchParams({ tab: value }, { replace: true });
  };

  return (
    <div className="p-4 md:p-8 min-w-0">
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
          <FlaskConical className="w-6 h-6 text-[#e20404]" /> R&D Engine Developer
        </h1>
        <p className="text-sm text-slate-500">Simulator, dyno data, prediction rules & model training</p>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <div className="overflow-x-auto pb-1">
          <TabsList className="inline-flex w-max">
            {TABS.map((t) => (
              <TabsTrigger key={t.key} value={t.key} className="flex items-center gap-1.5 whitespace-nowrap">
                <t.icon className="w-4 h-4" /> {t.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {TABS.map((t) => (
          <TabsContent key={t.key} value={t.key}>
            <Suspense fallback={<LoadingState rows={4} />}>
              <t.Comp />
            </Suspense>
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}