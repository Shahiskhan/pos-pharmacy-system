import React, { useEffect, useState } from 'react';
import MainLayout from './components/layout/MainLayout';
import DashboardView from './views/DashboardView';
import BillingView from './views/BillingView';
import InventoryView from './views/InventoryView';
import SalesHistoryView from './views/SalesHistoryView';
import CustomerLedgerView from './views/CustomerLedgerView';
import AdminPanelView from './views/AdminPanelView';
import AdminForgotPasswordView from './views/AdminForgotPasswordView';
import LoginView from './views/LoginView';
import { exportDatabaseBackup } from './services/localDb';
import { getSessionUser, logoutStaffUser, syncDefaultStaffUsers } from './services/staffAuth';

export default function App() {
  const [sessionUser, setSessionUser] = useState(() => getSessionUser());
  const [activeRoute, setActiveRoute] = useState(sessionUser ? 'billing' : 'login');

  useEffect(() => {
    syncDefaultStaffUsers().catch((error) => console.error('Could not initialize staff users:', error));
  }, []);

  useEffect(() => {
    if (!sessionUser) {
      setActiveRoute('login');
      return;
    }

    const nextRoute = sessionUser.role === 'Counter Staff' ? 'billing'
      : sessionUser.role === 'Pharmacist' ? 'inventory'
      : sessionUser.role === 'Customer Relation' ? 'customer-ledger'
      : 'dashboard';

    setActiveRoute(nextRoute);
  }, [sessionUser]);

  useEffect(() => {
    const api = window.electronAPI;
    if (!api?.writeBackup || !api?.on || !api?.completeBackupBeforeQuit) return undefined;

    let backupPromise = null;
    const saveBackup = (force = false) => {
      if (backupPromise) return backupPromise;
      backupPromise = (async () => {
        const dateStamp = new Date().toISOString().slice(0, 10);
        const backupKey = 'pharmacy-pos:last-automatic-backup';
        if (!force && window.localStorage.getItem(backupKey) === dateStamp) return;
        const backup = await exportDatabaseBackup();
        const result = await api.writeBackup(backup);
        if (!result?.success) throw new Error(result?.error || 'The backup could not be written.');
        window.localStorage.setItem(backupKey, dateStamp);
      })().finally(() => {
        backupPromise = null;
      });
      return backupPromise;
    };

    const runDailyBackup = () => {
      saveBackup().catch((error) => console.error('Automatic local backup failed:', error));
    };
    runDailyBackup();
    const dailyTimer = window.setInterval(runDailyBackup, 60 * 60 * 1000);
    const unsubscribe = api.on('pos:backup-before-quit', async () => {
      try {
        await saveBackup(true);
        api.completeBackupBeforeQuit({ success: true });
      } catch (error) {
        console.error('Backup before application exit failed:', error);
        api.completeBackupBeforeQuit({ success: false, error: error.message });
      }
    });

    return () => {
      window.clearInterval(dailyTimer);
      unsubscribe();
    };
  }, []);

  const handleLogout = () => {
    logoutStaffUser();
    setSessionUser(null);
    setActiveRoute('login');
  };

  const handleAdminLogout = () => {
    logoutStaffUser();
    setSessionUser(null);
    setActiveRoute('login');
  };

  const renderActiveView = () => {
    switch (activeRoute) {
      case 'login':
        return <LoginView onLoginSuccess={(user) => { setSessionUser(user); setActiveRoute(user.role === 'Counter Staff' ? 'billing' : user.role === 'Pharmacist' ? 'inventory' : user.role === 'Customer Relation' ? 'customer-ledger' : 'dashboard'); }} onOpenAdmin={() => setActiveRoute('admin')} />;
      case 'dashboard':
        return <DashboardView onNavigate={setActiveRoute} />;
      case 'inventory':
        return <InventoryView />;
      case 'sales-history':
        return <SalesHistoryView />;
      case 'customer-ledger':
        return <CustomerLedgerView />;
      case 'admin':
        return <AdminPanelView onNavigate={setActiveRoute} onLogout={handleAdminLogout} />;
      case 'admin-forgot-password':
        return <AdminForgotPasswordView onNavigate={setActiveRoute} />;
      default:
        return <DashboardView onNavigate={setActiveRoute} />;
    }
  };

  if (activeRoute === 'login') {
    return <LoginView onLoginSuccess={(user) => { setSessionUser(user); setActiveRoute(user.role === 'Counter Staff' ? 'billing' : user.role === 'Pharmacist' ? 'inventory' : user.role === 'Customer Relation' ? 'customer-ledger' : 'dashboard'); }} onOpenAdmin={() => setActiveRoute('admin')} />;
  }

  if (activeRoute === 'admin' || activeRoute === 'admin-forgot-password') {
    return (
      <div className="admin-portal min-h-screen bg-gradient-to-br from-slate-100 via-white to-emerald-50">
        {renderActiveView()}
      </div>
    );
  }

  return (
    <MainLayout activeRoute={activeRoute} onNavigate={setActiveRoute}>
      <div className={activeRoute === 'billing' ? 'h-full' : 'hidden'}>
        <BillingView isActive={activeRoute === 'billing'} />
      </div>
      {activeRoute !== 'billing' && <div className="h-full">{renderActiveView()}</div>}
      {sessionUser && (
        <div className="absolute right-6 top-6 z-20">
          <button
            type="button"
            onClick={handleLogout}
            className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
          >
            {sessionUser.name} · Logout
          </button>
        </div>
      )}
    </MainLayout>
  );
}
