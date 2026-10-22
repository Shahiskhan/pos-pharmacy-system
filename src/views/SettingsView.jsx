import React, { useState, useEffect } from 'react';
import {
  Settings,
  Database,
  ShieldAlert,
  Download,
  Trash2,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  Server,
  User,
  HardDrive,
  Printer,
  X,
  Loader2,
  FileText,
} from 'lucide-react';
import {
  getMedicines,
  getSales,
  getSuppliers,
  clearAllData,
  exportDatabaseBackup,
} from '../services/localDb';

export default function SettingsView() {
  const [stats, setStats] = useState({
    medicinesCount: 0,
    salesCount: 0,
    suppliersCount: 0,
  });
  const [loading, setLoading] = useState(true);
  const [statsError, setStatsError] = useState(null);

  // Factory Reset Modal State
  const [showResetModal, setShowResetModal] = useState(false);
  const [resetConfirmationInput, setResetConfirmationInput] = useState('');
  const [confirmDataLoss, setConfirmDataLoss] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  const loadDatabaseStats = async () => {
    try {
      const [meds, sales, sups] = await Promise.all([
        getMedicines(),
        getSales(),
        getSuppliers(),
      ]);
      setStats({
        medicinesCount: meds.length,
        salesCount: sales.length,
        suppliersCount: sups.length,
      });
      setStatsError(null);
    } catch (err) {
      console.error('Failed to load database stats:', err);
      setStatsError(`Failed to load database diagnostics: ${err.message}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDatabaseStats();
  }, []);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // Export JSON Backup
  const handleExportBackup = async () => {
    try {
      const backupData = await exportDatabaseBackup();
      const dataStr = 'data:text/json;charset=utf-8,' + encodeURIComponent(JSON.stringify(backupData, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute('href', dataStr);
      const dateStr = new Date().toISOString().split('T')[0];
      downloadAnchor.setAttribute('download', `Hafiz_Pharmacy_POS_Backup_${dateStr}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();

      triggerToast('Local database backup exported successfully (.json)');
    } catch (err) {
      alert(`Export failed: ${err.message}`);
    }
  };

  // Perform Factory Reset
  const handleExecuteReset = async () => {
    if (!confirmDataLoss || resetConfirmationInput.trim().toUpperCase() !== 'RESET' || isResetting) return;

    setIsResetting(true);
    try {
      await clearAllData();
      setShowResetModal(false);
      setResetConfirmationInput('');
      setConfirmDataLoss(false);

      triggerToast('All local database records were cleared.');

      await loadDatabaseStats();
    } catch (err) {
      alert(`Factory reset failed: ${err.message}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-5xl mx-auto pb-12 select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xl border border-slate-700 animate-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex items-center justify-between">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <Settings className="h-5 w-5 text-emerald-600" />
            System Configuration & Maintenance
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Local storage diagnostics, database backups, and emergency factory reset controls.
          </p>
        </div>

        <button
          onClick={loadDatabaseStats}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition"
        >
          <RefreshCw className="h-3.5 w-3.5" />
          Refresh Diagnostics
        </button>
      </div>

      {statsError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {statsError}
        </div>
      )}

      {/* Terminal & Environment Specs */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <Server className="h-4 w-4 text-emerald-600" />
            Active Terminal Identity
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Pharmacy Name:</span>
              <span className="font-bold text-slate-900">Hafiz Pharmacy POS</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Station / Counter:</span>
              <span className="font-bold text-slate-900">Desk Terminal #01 (Main Dispensing)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Active Operator:</span>
              <span className="font-bold text-emerald-700">Muhammad Shahis</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Assigned Shift:</span>
              <span className="font-semibold text-slate-700">Lead Store Operator • Shift 1</span>
            </div>
          </div>
        </div>

        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
          <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
            <HardDrive className="h-4 w-4 text-emerald-600" />
            Storage Engine & Hardware Integration
          </h3>

          <div className="space-y-2.5 text-xs">
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Local Database:</span>
              <span className="font-mono font-bold text-emerald-700">Hafiz Pharmacy POS LocalDB (IndexedDB)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Network Dependency:</span>
              <span className="font-bold text-slate-800">Zero-Config (Runs 100% Offline)</span>
            </div>
            <div className="flex justify-between py-1.5 border-b border-slate-100">
              <span className="text-slate-500">Receipt Target:</span>
              <span className="font-bold text-slate-900">80mm Thermal Printer Ready</span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-slate-500">Barcode Scanner:</span>
              <span className="font-bold text-slate-900">USB / Bluetooth Auto-Enter Compatible</span>
            </div>
          </div>
        </div>
      </div>

      {/* Local Database Metrics Card */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
        <h3 className="font-bold text-slate-800 text-sm flex items-center gap-2">
          <Database className="h-4 w-4 text-emerald-600" />
          IndexedDB Object Store Health
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Medicines Store
            </span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {stats.medicinesCount}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">Batches in inventory</span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Sales Ledger Store
            </span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {stats.salesCount}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">Invoices recorded</span>
          </div>

          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
              Suppliers Store
            </span>
            <span className="text-2xl font-black text-slate-900 mt-1 block">
              {stats.suppliersCount}
            </span>
            <span className="text-[11px] text-slate-500 mt-0.5 block">Wholesale partners</span>
          </div>
        </div>

        {/* Database Backup Action */}
        <div className="pt-2 flex justify-end">
          <button
            onClick={handleExportBackup}
            className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold shadow-sm transition flex items-center gap-2"
          >
            <Download className="h-4 w-4 text-emerald-400" />
            Export Full Database Backup (.json)
          </button>
        </div>
      </div>

      {/* Danger Zone: Factory Reset */}
      <div className="bg-rose-50/50 rounded-xl border border-rose-200 p-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700 flex-shrink-0">
            <ShieldAlert className="h-6 w-6" />
          </div>
          <div>
            <h3 className="font-bold text-rose-950 text-sm">System Data & Maintenance: Danger Zone</h3>
            <p className="text-xs text-rose-800/80 mt-0.5">
              Permanently purges local IndexedDB records on this computer. Use only when decommissioning the station or preparing for a clean production setup.
            </p>
          </div>
        </div>

        <div className="pt-2 flex justify-end">
          <button
            onClick={() => {
              setResetConfirmationInput('');
              setConfirmDataLoss(false);
              setShowResetModal(true);
            }}
            className="px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs shadow-md shadow-rose-700/20 transition flex items-center gap-2 active:scale-95"
          >
            <Trash2 className="h-4 w-4" />
            Clear All System Data (Factory Reset)
          </button>
        </div>
      </div>

      {/* FACTORY RESET DOUBLE CONFIRMATION MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-2xl border border-rose-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 flex-shrink-0">
                <AlertTriangle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-base">
                  Confirm Full Factory Reset
                </h3>
                <p className="text-xs text-rose-700 mt-1 font-medium">
                  This will permanently erase all local medicine batches, sales transactions, refunds, and supplier records.
                </p>
              </div>
            </div>

            {/* First confirmation */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs">
              <label className="flex items-center gap-2.5 cursor-pointer font-medium text-slate-800">
                <input
                  type="checkbox"
                  checked={confirmDataLoss}
                  onChange={(e) => setConfirmDataLoss(e.target.checked)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 h-4 w-4"
                />
                <span>I understand this permanently deletes all local data.</span>
              </label>
              <p className="text-[11px] text-slate-400 ml-6.5 mt-0.5">
                This removes all medicine batches, sales, returns, and supplier records.
              </p>
            </div>

            {/* Security Word Challenge */}
            <div className="space-y-1.5 text-xs">
              <label className="block text-slate-700 font-semibold">
                Type <strong className="text-rose-600 font-mono">RESET</strong> to unlock the factory reset button:
              </label>
              <input
                type="text"
                placeholder="Type RESET"
                value={resetConfirmationInput}
                onChange={(e) => setResetConfirmationInput(e.target.value)}
                className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm font-mono font-bold tracking-widest text-slate-900 uppercase focus:outline-none focus:ring-2 focus:ring-rose-500"
                autoFocus
              />
            </div>

            {/* Action Buttons */}
            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setShowResetModal(false)}
                disabled={isResetting}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleExecuteReset}
                disabled={!confirmDataLoss || resetConfirmationInput.trim().toUpperCase() !== 'RESET' || isResetting}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-bold text-xs shadow-md shadow-rose-700/20 transition flex items-center gap-2"
              >
                {isResetting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Clearing Storage...
                  </>
                ) : (
                  <>
                    <Trash2 className="h-4 w-4" />
                    Wipe Database Now
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
