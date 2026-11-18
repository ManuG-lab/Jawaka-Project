import React from 'react';

interface State {
  hasError: boolean;
  message: string;
}

export class ErrorBoundary extends React.Component<{ children: React.ReactNode }, State> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, message: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, message: error.message || 'An unexpected error occurred.' };
  }

  render() {
    if (this.state.hasError) {
      let friendly = this.state.message;
      try {
        const parsed = JSON.parse(this.state.message) as { error?: string; operationType?: string; path?: string };
        if (parsed.error) {
          friendly = `${parsed.error}${parsed.path ? ` (${parsed.operationType} on ${parsed.path})` : ''}`;
        }
      } catch {
        // non-JSON error message
      }

      return (
        <div className="min-h-screen bg-[#FAF6EE] text-[#1C1714] flex items-center justify-center p-6">
          <div className="max-w-lg w-full bg-white border border-[#D9CEBC] p-8 shadow-sm">
            <p className="text-xs uppercase tracking-widest text-[#B93829] font-semibold mb-2">
              Jawaka Catering Notice
            </p>
            <h1 className="font-display text-2xl font-bold mb-3">Something went wrong</h1>
            <p className="text-sm text-[#61554C] mb-6 break-words">{friendly}</p>
            <button
              onClick={() => window.location.reload()}
              className="px-5 py-2.5 bg-[#1C1714] text-[#FAF6EE] text-sm font-medium hover:bg-[#332B26] transition-colors"
            >
              Reload Application
            </button>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
