import React from 'react';
import {
  LayoutDashboard,
  Receipt,
  Package,
  FileSpreadsheet,
  Truck,
  BarChart3,
  History,
  Settings,
  Activity,
  ShieldCheck,
  ChevronRight,
} from 'lucide-react';

export const NAVIGATION_ITEMS = [
  {
    id: 'dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    badge: null,
    shortcut: 'F1',
    description: 'Overview & key metrics',
  },
  {
    id: 'billing',
    label: 'POS Billing',
    icon: Receipt,
    badge: 'Quick POS',
    shortcut: 'F2',
    description: 'Dispensing & checkout',
  },
  {
    id: 'inventory',
    label: 'Inventory',
    icon: Package,
    badge: '12 Low',
    shortcut: 'F3',
    description: 'Medicine stocks & batches',
  },
  {
    id: 'sales-history',
    label: 'Sales & Returns',
    icon: History,
    badge: null,
    shortcut: 'F4',
    description: 'Invoices, refunds & restock',
  },
  {
    id: 'excel-import',
    label: 'Excel Import',
    icon: FileSpreadsheet,
    badge: null,
    shortcut: 'F5',
    description: 'Bulk catalog & inventory upload',
  },
  {
    id: 'suppliers',
    label: 'Suppliers',
    icon: Truck,
    badge: null,
    shortcut: 'F6',
    description: 'Distributors & procurement',
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: BarChart3,
    badge: null,
    shortcut: 'F7',
    description: 'Sales, taxes & audit logs',
  },
  {
    id: 'settings',
    label: 'Settings',
    icon: Settings,
    badge: null,
    shortcut: 'F8',
    description: 'System, backup & factory reset',
  },
];

export default function Sidebar({ activeRoute, onNavigate }) {
  return (
    <aside className="w-64 flex-shrink-0 flex flex-col bg-slate-900 border-r border-slate-800 text-slate-300 select-none h-screen">
      {/* Brand & Pharmacy Identity */}
      <div className="h-16 flex items-center px-5 border-b border-slate-800/80 bg-slate-900/90 gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 text-white shadow-md shadow-emerald-950 font-bold text-lg tracking-wider">
          Rx
        </div>
        <div className="flex flex-col min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="font-bold text-slate-100 text-sm tracking-tight truncate">
              Hafiz Pharmacy POS
            </span>
          </div>
          <span className="text-[11px] font-medium text-emerald-400 truncate flex items-center gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
            Terminal #01 • Main Desk
          </span>
        </div>
      </div>

      {/* Navigation Section */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        <div className="px-3 pb-2 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
          Core Modules
        </div>

        {NAVIGATION_ITEMS.map((item) => {
          const Icon = item.icon;
          const isActive = activeRoute === item.id;

          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={`group relative flex w-full items-center gap-3.5 rounded-xl px-3.5 py-3 text-sm font-medium transition-all duration-200 ${
                isActive
                  ? 'bg-emerald-600 text-white shadow-lg shadow-emerald-900/40 font-semibold'
                  : 'text-slate-400 hover:bg-slate-800/70 hover:text-slate-200'
              }`}
            >
              {/* Active Indicator Bar */}
              {isActive && (
                <span className="absolute left-0 top-2 bottom-2 w-1.5 rounded-r-full bg-emerald-300 shadow-sm" />
              )}

              <Icon
                className={`h-5 w-5 flex-shrink-0 transition-transform duration-200 ${
                  isActive
                    ? 'text-white scale-105'
                    : 'text-slate-400 group-hover:text-emerald-400 group-hover:scale-105'
                }`}
              />

              <div className="flex-1 text-left flex items-center justify-between min-w-0">
                <span className="truncate">{item.label}</span>
                {item.badge && (
                  <span
                    className={`ml-2 text-[10px] font-semibold px-2 py-0.5 rounded-full ${
                      isActive
                        ? 'bg-emerald-700/80 text-emerald-100'
                        : item.badge.includes('Low')
                        ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                        : 'bg-slate-800 text-slate-400 border border-slate-700'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </div>

              {/* Shortcut key */}
              <span
                className={`hidden xl:inline text-[10px] font-mono px-1.5 py-0.5 rounded ${
                  isActive ? 'bg-emerald-700 text-emerald-200' : 'text-slate-600'
                }`}
              >
                {item.shortcut}
              </span>
            </button>
          );
        })}
      </div>

      {/* Footer / System Status */}
      <div className="p-3 border-t border-slate-800/80 bg-slate-900/60">
        <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3">
          <div className="flex items-center justify-between text-xs mb-1.5">
            <span className="text-slate-400 flex items-center gap-1.5 font-medium">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              Local POS Engine
            </span>
            <span className="text-[10px] font-semibold text-emerald-400 bg-emerald-950/80 px-1.5 py-0.5 rounded border border-emerald-800/40">
              v1.0.0
            </span>
          </div>
          <p className="text-[11px] text-slate-500 leading-tight">
            IndexedDB storage • Offline ready
          </p>
        </div>
      </div>
    </aside>
  );
}
