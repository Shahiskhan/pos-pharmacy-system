import React, { useState } from 'react';
import MainLayout from './components/layout/MainLayout';
import DashboardView from './views/DashboardView';
import BillingView from './views/BillingView';
import InventoryView from './views/InventoryView';
import SalesHistoryView from './views/SalesHistoryView';
import ExcelImportView from './views/ExcelImportView';
import SuppliersView from './views/SuppliersView';
import ReportsView from './views/ReportsView';
import SettingsView from './views/SettingsView';

export default function App() {
  const [activeRoute, setActiveRoute] = useState('billing'); // Default to POS Billing for quick cashier access

  const renderActiveView = () => {
    switch (activeRoute) {
      case 'dashboard':
        return <DashboardView onNavigate={setActiveRoute} />;
      case 'inventory':
        return <InventoryView />;
      case 'sales-history':
        return <SalesHistoryView />;
      case 'excel-import':
        return <ExcelImportView onNavigate={setActiveRoute} />;
      case 'suppliers':
        return <SuppliersView />;
      case 'reports':
        return <ReportsView />;
      case 'settings':
        return <SettingsView />;
      default:
        return <DashboardView onNavigate={setActiveRoute} />;
    }
  };

  return (
    <MainLayout activeRoute={activeRoute} onNavigate={setActiveRoute}>
      <div className={activeRoute === 'billing' ? 'h-full' : 'hidden'}>
        <BillingView isActive={activeRoute === 'billing'} />
      </div>
      {activeRoute !== 'billing' && <div className="h-full">{renderActiveView()}</div>}
    </MainLayout>
  );
}
