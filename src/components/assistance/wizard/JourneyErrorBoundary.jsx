import React from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";

// Scoped recovery for the financing journey. A render error here must never take
// down the whole portal page: the customer keeps their submitted application and
// gets one clear way back to the live status instead of a white screen.
export default class JourneyErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error) {
    // Kept for the console only. Nothing here is shown to the customer.
    console.error("Financing journey render error", error);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div className="space-y-3 rounded-2xl border border-amber-200 bg-amber-50 p-4">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-4 w-4 flex-none text-amber-600" />
          <div className="min-w-0">
            <p className="text-sm font-semibold text-amber-900">This page could not finish loading</p>
            <p className="mt-1 text-xs leading-relaxed text-amber-800">
              Your application was not lost or submitted twice. Nothing below has changed. Reload the page to see the current status of your
              application, or send this link to Elite if it keeps happening.
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button className="h-11 flex-1" onClick={() => window.location.reload()}>Reload my offer</Button>
          <Button
            variant="outline"
            className="h-11 flex-1"
            onClick={() => {
              this.setState({ failed: false });
              this.props.onRecover?.();
            }}
          >
            Try again
          </Button>
        </div>
      </div>
    );
  }
}