import React from "react";

// Error boundary that catches render crashes and shows the actual error
// instead of a blank white screen, so we can diagnose the issue.
export default class JobCardErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null, info: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("JobCard render error:", error, info);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="p-8 max-w-2xl mx-auto">
          <div className="bg-red-50 border border-red-200 rounded-lg p-6">
            <h2 className="text-lg font-bold text-red-900 mb-2">Job Card Error</h2>
            <p className="text-sm text-red-700 mb-4">
              {this.state.error?.message || String(this.state.error)}
            </p>
            {this.state.info?.componentStack && (
              <pre className="text-xs text-red-600 bg-red-100 p-3 rounded overflow-auto max-h-60">
                {this.state.info.componentStack}
              </pre>
            )}
            <button
              onClick={() => this.setState({ hasError: false, error: null, info: null })}
              className="mt-4 px-4 py-2 bg-red-600 text-white rounded text-sm"
            >
              Try again
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}