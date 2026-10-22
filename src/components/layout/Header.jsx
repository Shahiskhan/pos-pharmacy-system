import React, { useState, useEffect } from 'react';
import {
  Wifi,
  WifiOff,
  Clock,
  Calendar,
  Printer,
} from 'lucide-react';
import { NAVIGATION_ITEMS } from './Sidebar';
import useStoreConfig from '../../hooks/useStoreConfig';

export default function Header({ activeRoute }) {
  const store = useStoreConfig();
  // Live Date & Time
  const [currentTime, setCurrentTime] = useState(new Date());

  // Online / Offline Status
  const [isOnline, setIsOnline] = useState(
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );

  useEffect(() => {
    document.title = store.appName;
  }, [store.appName]);

  useEffect(() => {
    // 1-second interval timer for POS accuracy
    const timer = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    // Browser network listeners
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      clearInterval(timer);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, []);

  const currentNav = NAVIGATION_ITEMS.find((item) => item.id === activeRoute) || {
    label: 'Dashboard',
    description: 'Overview & key metrics',
  };

  // Format Date & Time
  const formattedDate = currentTime.toLocaleDateString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

  const formattedTime = currentTime.toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <header className="h-16 flex-shrink-0 bg-white border-b border-slate-200/80 px-6 flex items-center justify-between shadow-sm z-10 select-none">
      {/* Active Module Title */}
      <div className="flex items-center gap-3">
        <div>
          <h1 className="text-lg font-bold text-slate-800 tracking-tight leading-tight flex items-center gap-2">
            {currentNav.label}
          </h1>
          <p className="text-xs text-slate-500 font-medium">
            {store.appName} • {currentNav.description}
          </p>
        </div>
      </div>

      {/* Right Controls: Date/Time, Connection, Cashier Profile */}
      <div className="flex items-center gap-4">
        {/* Live Date & Time Display */}
        <div className="hidden md:flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs font-medium text-slate-700 shadow-sm">
          <Calendar className="h-3.5 w-3.5 text-slate-400" />
          <span>{formattedDate}</span>
          <span className="text-slate-300">|</span>
          <Clock className="h-3.5 w-3.5 text-emerald-600" />
          <span className="font-mono font-semibold text-slate-800">{formattedTime}</span>
        </div>

        {/* Network status */}
        <div
          className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-semibold border transition-all duration-200 ${
            isOnline
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
              : 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse'
          }`}
          title={isOnline ? 'Local IndexedDB is available' : 'Offline mode; local IndexedDB remains available'}
        >
          {isOnline ? (
            <>
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <Wifi className="h-3.5 w-3.5 text-emerald-600" />
              <span>Network Online</span>
            </>
          ) : (
            <>
              <span className="h-2 w-2 rounded-full bg-rose-500"></span>
              <WifiOff className="h-3.5 w-3.5 text-rose-600" />
              <span>Offline Mode</span>
            </>
          )}

        </div>

        {/* Printer Quick Status */}
        <div className="hidden lg:flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs text-slate-600">
          <Printer className="h-3.5 w-3.5 text-slate-500" />
          <span className="font-medium text-slate-700">Receipt 80mm</span>
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500"></span>
        </div>

        {/* Cashier Profile Badge */}
        <div className="flex items-center gap-3 pl-2 border-l border-slate-200">
          <div className="flex items-center gap-2.5">
            <div className="relative">
              <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-slate-800 to-slate-700 flex items-center justify-center text-white font-bold text-xs shadow-sm ring-2 ring-emerald-500/30">
                {store.defaultOperator.split(/\s+/).map((part) => part[0]).join('').slice(0, 2).toUpperCase()}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-500 border-2 border-white"></span>
            </div>

            <div className="flex flex-col text-left">
              <div className="flex items-center gap-1">
                <span className="text-xs font-bold text-slate-800 leading-tight">
                  {store.defaultOperator}
                </span>
              </div>
              <span className="text-[10px] font-medium text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200/60 mt-0.5 inline-block w-max">
                {store.defaultOperator}
              </span>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
