import React, { useEffect } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';

export default function MainLayout({ activeRoute, onNavigate, children }) {
  // Global POS Keyboard Shortcuts (F1 to F6)
  useEffect(() => {
    const handleKeyDown = (e) => {
      // Prevent browser default refresh or search on F keys if needed
      switch (e.key) {
        case 'F1':
          e.preventDefault();
          onNavigate('dashboard');
          break;
        case 'F2':
          // If not in billing, navigate to billing. If already in billing, let BillingView trigger checkout
          if (activeRoute !== 'billing') {
            e.preventDefault();
            onNavigate('billing');
          }
          break;
        case 'F3':
          e.preventDefault();
          onNavigate('inventory');
          break;
        case 'F4':
          // If in billing, let BillingView clear cart. Otherwise open sales history.
          if (activeRoute !== 'billing') {
            e.preventDefault();
            onNavigate('sales-history');
          }
          break;
        case 'F9':
          e.preventDefault();
          onNavigate('customer-ledger');
          break;
        case 'F10':
          e.preventDefault();
          onNavigate('admin');
          break;
        default:
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeRoute, onNavigate]);

  return (
    <div className="flex h-screen w-screen overflow-hidden bg-slate-100 font-sans antialiased text-slate-800">
      {/* Fixed Left Sidebar Navigation */}
      <Sidebar activeRoute={activeRoute} onNavigate={onNavigate} />

      {/* Main App Container */}
      <div className="flex flex-1 flex-col min-w-0 overflow-hidden">
        {/* Header Bar */}
        <Header activeRoute={activeRoute} />

        {/* Dynamic View Scrollable Container */}
        <main className="flex-1 overflow-y-auto bg-slate-100 p-6">
          <div className="h-full">
            {children}
          </div>
        </main>
      </div>
    </div>
  );
}
