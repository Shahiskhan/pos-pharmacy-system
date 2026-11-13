import React, { useState, useEffect } from 'react';
import {
  DollarSign,
  ShoppingCart,
  AlertTriangle,
  Clock,
  ArrowUpRight,
} from 'lucide-react';
import { getMedicines, getSales } from '../services/localDb';
import useStoreConfig from '../hooks/useStoreConfig';

export default function DashboardView({ onNavigate }) {
  const store = useStoreConfig();
  const [medicines, setMedicines] = useState([]);
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function loadData() {
      try {
        const [medsData, salesData] = await Promise.all([
          getMedicines(),
          getSales(),
        ]);
        setMedicines(medsData);
        setSales(salesData);
      } catch (err) {
        console.error('Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    }
    loadData();
  }, []);

  // Compute live KPIs
  const totalSalesAmount = sales.reduce((sum, s) => sum + Number(s.grandTotal || 0), 0);
  const lowStockItems = medicines.filter((m) => Number(m.quantity || 0) <= 20);

  const stats = [
    {
      title: "Today's Gross Sales",
      value: sales.length > 0 ? `$${totalSalesAmount.toFixed(2)}` : '$0.00',
      change: `${sales.length} transactions recorded`,
      icon: DollarSign,
      accent: 'text-emerald-600 bg-emerald-50 border-emerald-200',
    },
    {
      title: 'Prescriptions Dispensed',
      value: `${sales.length} Invoices`,
      change: 'Local zero-config DB',
      icon: ShoppingCart,
      accent: 'text-teal-600 bg-teal-50 border-teal-200',
    },
    {
      title: 'Low Stock Alert',
      value: `${lowStockItems.length} Medicines`,
      change: 'Items with quantity <= 20',
      icon: AlertTriangle,
      accent: 'text-amber-600 bg-amber-50 border-amber-200',
    },
    {
      title: 'Total Catalog',
      value: `${medicines.length} Items`,
      change: 'Active in inventory',
      icon: Clock,
      accent: 'text-rose-600 bg-rose-50 border-rose-200',
    },
  ];

  return (
    <div className="space-y-6">
      {/* Quick Action Top Banner */}
      <div className="bg-gradient-to-r from-emerald-600 via-emerald-700 to-teal-800 rounded-2xl p-6 text-white shadow-md relative overflow-hidden flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="relative z-10">
          <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/30 text-emerald-100 text-xs font-semibold mb-2 backdrop-blur-sm">
            Ready for Billing • Fast Register
          </span>
          <h2 className="text-2xl font-bold tracking-tight">Welcome back, {store.defaultOperator}</h2>
          <p className="text-emerald-100 text-sm mt-1 max-w-xl">
            Register is open and connected to local IndexedDB engine. Press <kbd className="px-1.5 py-0.5 rounded bg-emerald-800/80 text-xs font-mono">F2</kbd> or click below to launch rapid POS billing.
          </p>
        </div>
        <div className="flex gap-3 relative z-10 flex-shrink-0">
          <button
            onClick={() => onNavigate('billing')}
            className="px-5 py-2.5 rounded-xl bg-white text-emerald-800 font-semibold text-sm shadow hover:bg-emerald-50 transition active:scale-95 flex items-center gap-2"
          >
            <ShoppingCart className="h-4 w-4 text-emerald-700" />
            Launch POS Counter
          </button>
          <button
            onClick={() => onNavigate('inventory')}
            className="px-4 py-2.5 rounded-xl bg-emerald-800/80 hover:bg-emerald-800 text-white font-medium text-sm border border-emerald-500/40 transition active:scale-95"
          >
            Check Inventory
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {stats.map((stat, idx) => {
          const Icon = stat.icon;
          return (
            <div
              key={idx}
              className="bg-white rounded-xl border border-slate-200/90 p-5 shadow-sm hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">
                  {stat.title}
                </span>
                <div className={`p-2 rounded-lg border ${stat.accent}`}>
                  <Icon className="h-4 w-4" />
                </div>
              </div>
              <div className="mt-3">
                <div className="text-2xl font-extrabold text-slate-900 tracking-tight">
                  {stat.value}
                </div>
                <div className="mt-1 text-xs text-slate-500 flex items-center gap-1 font-medium">
                  {stat.change}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Two Column Layout: Recent Sales & Low Stock Alert */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Recent Transactions */}
        <div className="lg:col-span-2 bg-white rounded-xl border border-slate-200/90 shadow-sm p-5">
          <div className="flex items-center justify-between pb-4 border-b border-slate-100">
            <div>
              <h3 className="font-bold text-slate-800 text-base">Recent Dispensed Sales</h3>
              <p className="text-xs text-slate-500">Live invoices saved in local IndexedDB</p>
            </div>
            <button
              onClick={() => onNavigate('sales-history')}
              className="text-xs font-semibold text-emerald-600 hover:text-emerald-700 flex items-center gap-1 hover:underline"
            >
              Full Ledger <ArrowUpRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="mt-3 overflow-x-auto">
            {sales.length === 0 ? (
              <div className="py-8 text-center text-xs text-slate-400">
                No sales recorded yet. Press F2 or launch POS Counter to dispense medicines!
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="py-2.5 px-3">Invoice #</th>
                    <th className="py-2.5 px-3">Time</th>
                    <th className="py-2.5 px-3">Cashier</th>
                    <th className="py-2.5 px-3">Items</th>
                    <th className="py-2.5 px-3 text-right">Grand Total</th>
                    <th className="py-2.5 px-3 text-center">Payment</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sales.slice(0, 5).map((tx) => (
                    <tr key={tx.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3 font-mono font-medium text-slate-900 text-xs">
                        {tx.invoiceNo}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-xs">
                        {new Date(tx.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="py-3 px-3 text-slate-700 font-medium text-xs">
                        {tx.cashierName}
                      </td>
                      <td className="py-3 px-3 text-slate-500 text-xs">
                        {tx.items?.length || 0} items
                      </td>
                      <td className="py-3 px-3 font-bold text-slate-900 text-right text-xs">
                        ${Number(tx.grandTotal).toFixed(2)}
                      </td>
                      <td className="py-3 px-3 text-center">
                        <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 border border-emerald-200">
                          {tx.paymentMode}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Low Stock Warning Card */}
        <div className="bg-white rounded-xl border border-slate-200/90 shadow-sm p-5 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-1.5 rounded-lg bg-amber-50 text-amber-600 border border-amber-200">
                  <AlertTriangle className="h-4 w-4" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-800 text-sm">Critical Stock Alert</h3>
                  <p className="text-[11px] text-slate-500">Items with &le; 20 units</p>
                </div>
              </div>
              <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                {lowStockItems.length} Urgent
              </span>
            </div>

            <div className="mt-3 space-y-3">
              {lowStockItems.slice(0, 4).map((med) => (
                <div
                  key={med.id}
                  className="p-2.5 rounded-lg border border-slate-100 bg-slate-50/70 hover:bg-slate-50 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="font-semibold text-slate-800 text-xs">{med.productName}</span>
                    <span className="text-[11px] font-bold text-rose-600">
                      {med.quantity} left
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-1">
                    <span>Batch: {med.batchNo}</span>
                    <span>Retail: ${Number(med.sellingPrice).toFixed(2)}</span>
                  </div>
                </div>
              ))}
              {lowStockItems.length === 0 && (
                <div className="text-center py-6 text-xs text-slate-400">
                  All inventory stocks are at healthy levels.
                </div>
              )}
            </div>
          </div>

          <button
            onClick={() => onNavigate('admin')}
            className="mt-4 w-full py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition"
          >
            Manage suppliers in Admin Panel
          </button>
        </div>
      </div>
    </div>
  );
}
