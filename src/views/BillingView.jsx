import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  Search,
  Barcode,
  Plus,
  Minus,
  Trash2,
  Printer,
  CreditCard,
  Banknote,
  User,
  Shield,
  FileText,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  Clock,
  Layers,
  ChevronDown,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { getMedicines, searchMedicines } from '../services/localDb';
import CheckoutModal from '../components/pos/CheckoutModal';
import ReceiptModal from '../components/pos/ReceiptModal';
import useStoreConfig from '../hooks/useStoreConfig';

function isBatchExpired(expiryDate) {
  if (!expiryDate) return false;
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today;
}

export default function BillingView({ isActive = true }) {
  const store = useStoreConfig();
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [inventoryError, setInventoryError] = useState(null);

  // Search & Barcode state
  const [searchInput, setSearchInput] = useState('');
  const [matchingMedicines, setMatchingMedicines] = useState([]);
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const searchInputRef = useRef(null);
  const searchRequestRef = useRef(0);
  const inventoryRequestRef = useRef(0);
  const scannerRef = useRef({ value: '', lastKeyAt: 0, scanStartedAt: 0, isScannerInput: false });

  // Cart state
  const [cart, setCart] = useState([]);
  const [warningToast, setWarningToast] = useState(null);

  // Modals state
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [completedSale, setCompletedSale] = useState(null);

  // Load medicines from local IndexedDB
  const fetchInventory = useCallback(async () => {
    const requestId = ++inventoryRequestRef.current;
    try {
      const data = await getMedicines();
      if (requestId === inventoryRequestRef.current) {
        setMedicines(data);
        setInventoryError(null);
      }
    } catch (err) {
      if (requestId === inventoryRequestRef.current) {
        console.error('Failed to load medicines for POS:', err);
        setInventoryError(`Unable to load inventory: ${err.message}`);
      }
    } finally {
      if (requestId === inventoryRequestRef.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchInventory();
    const handleDatabaseChange = () => {
      searchRequestRef.current += 1;
      setMatchingMedicines([]);
      fetchInventory();
    };
    window.addEventListener('pharmacydbchange', handleDatabaseChange);
    return () => window.removeEventListener('pharmacydbchange', handleDatabaseChange);
  }, [fetchInventory]);

  useEffect(() => {
    const query = searchInput.trim();
    const requestId = ++searchRequestRef.current;
    if (!query) {
      setMatchingMedicines([]);
      return undefined;
    }

    const timeoutId = window.setTimeout(async () => {
      try {
        const results = await searchMedicines(query);
        if (requestId === searchRequestRef.current) {
          setMatchingMedicines(results.slice(0, 8));
          setInventoryError(null);
        }
      } catch (err) {
        if (requestId === searchRequestRef.current) {
          console.error('Failed to search IndexedDB medicines for POS:', err);
          setMatchingMedicines([]);
          setInventoryError(`Unable to search inventory: ${err.message}`);
        }
      }
    }, 100);

    return () => window.clearTimeout(timeoutId);
  }, [searchInput, medicines]);

  // Permanent auto-focus helper
  const focusSearchInput = () => {
    setTimeout(() => {
      if (searchInputRef.current) {
        searchInputRef.current.focus();
      }
    }, 50);
  };

  useEffect(() => {
    if (isActive) focusSearchInput();
  }, [isActive, loading, showCheckoutModal, completedSale]);

  const showWarning = (msg) => {
    setWarningToast(msg);
    setTimeout(() => setWarningToast(null), 3000);
  };

  const handleScannedBarcode = async (barcode) => {
    try {
      const currentInventory = await getMedicines();
      const matchingBatches = currentInventory
        .filter((medicine) => String(medicine.barcode || '').trim().toLowerCase() === barcode.toLowerCase())
        .sort((a, b) => new Date(a.expiryDate || '2099-12-31') - new Date(b.expiryDate || '2099-12-31'));
      if (matchingBatches.length === 0) {
        showWarning(`No inventory batch found for barcode "${barcode}".`);
        return;
      }

      const availableBatch = matchingBatches.find(
        (batch) => Number(batch.quantity || 0) > 0 && !isBatchExpired(batch.expiryDate)
      );
      if (!availableBatch) {
        const expiredBatch = matchingBatches.find((batch) => isBatchExpired(batch.expiryDate));
        showWarning(expiredBatch
          ? `EXPIRED - BLOCKED: "${expiredBatch.productName}" batch ${expiredBatch.batchNo || ''} cannot be sold.`
          : `All batches for barcode "${barcode}" are out of stock.`);
        return;
      }
      await handleAddToCart(availableBatch);
    } catch (err) {
      console.error('Failed to resolve scanned barcode from IndexedDB:', err);
      setInventoryError(`Unable to look up scanned barcode: ${err.message}`);
    }
  };

  useEffect(() => {
    const handleScannerKeydown = (event) => {
      if (!isActive || showCheckoutModal || completedSale || event.ctrlKey || event.altKey || event.metaKey) return;

      const now = performance.now();
      const scanner = scannerRef.current;
      if (event.key === 'Enter') {
        const isFastScan = scanner.isScannerInput &&
          scanner.value.length >= 4 &&
          now - scanner.scanStartedAt <= 1200 &&
          now - scanner.lastKeyAt <= 120;
        scannerRef.current = { value: '', lastKeyAt: 0, scanStartedAt: 0, isScannerInput: false };
        if (isFastScan) {
          event.preventDefault();
          event.stopPropagation();
          handleScannedBarcode(scanner.value);
        }
        return;
      }

      if (event.key.length !== 1 || !/^[a-zA-Z0-9-]$/.test(event.key)) {
        scannerRef.current = { value: '', lastKeyAt: 0, scanStartedAt: 0, isScannerInput: false };
        return;
      }

      const gap = now - scanner.lastKeyAt;
      if (!scanner.lastKeyAt || gap > 70) {
        scannerRef.current = {
          value: event.key,
          lastKeyAt: now,
          scanStartedAt: now,
          isScannerInput: false,
        };
      } else {
        const value = `${scanner.value}${event.key}`;
        scannerRef.current = {
          value,
          lastKeyAt: now,
          scanStartedAt: scanner.scanStartedAt,
          isScannerInput: scanner.isScannerInput || value.length >= 4,
        };
      }
    };

    window.addEventListener('keydown', handleScannerKeydown, true);
    return () => window.removeEventListener('keydown', handleScannerKeydown, true);
  }, [isActive, showCheckoutModal, completedSale]);

  /**
   * FEFO Intelligent Item Addition:
   * If a medicine item is passed, selects the earliest expiring batch with stock > 0
   */
  const handleAddToCart = async (medicineRecord) => {
    if (!medicineRecord) return;

    let currentInventory;
    try {
      currentInventory = await getMedicines();
    } catch (err) {
      console.error('Failed to validate POS selection against IndexedDB:', err);
      setInventoryError(`Unable to validate inventory: ${err.message}`);
      return;
    }

    const currentRecord = currentInventory.find((medicine) => medicine.id === medicineRecord.id);
    if (!currentRecord) {
      showWarning(`"${medicineRecord.productName}" is no longer in inventory.`);
      return;
    }

    // Determine the best FEFO batch
    const groupKey = (currentRecord.barcode || currentRecord.productName || '').trim().toLowerCase();
    const batches = currentInventory
      .filter((medicine) =>
        (medicine.barcode || medicine.productName || '').trim().toLowerCase() === groupKey
      )
      .sort((a, b) => {
        const dateA = new Date(a.expiryDate || '2099-12-31').getTime();
        const dateB = new Date(b.expiryDate || '2099-12-31').getTime();
        return dateA - dateB;
      });

    // Find first batch with available stock
    const fefoBatch = batches.find(
      (batch) => Number(batch.quantity || 0) > 0 && !isBatchExpired(batch.expiryDate)
    );
    if (!fefoBatch) {
      const expiredBatch = batches.find((batch) => isBatchExpired(batch.expiryDate));
      if (expiredBatch) {
        showWarning(`EXPIRED - BLOCKED: "${expiredBatch.productName}" batch ${expiredBatch.batchNo || ''} cannot be sold.`);
        return;
      }
      showWarning(`"${currentRecord.productName}" is out of stock.`);
      return;
    }

    const availableStock = Number(fefoBatch.quantity || 0);
    if (availableStock <= 0) {
      showWarning(`"${fefoBatch.productName}" (Batch: ${fefoBatch.batchNo}) is out of stock!`);
      return;
    }

    setCart((prevCart) => {
      const existingItem = prevCart.find((item) => item.id === fefoBatch.id);
      if (existingItem) {
        if (existingItem.cartQuantity + 1 > availableStock) {
          showWarning(`Stock limit reached: Only ${availableStock} units available for Batch ${fefoBatch.batchNo}`);
          return prevCart;
        }
        return prevCart.map((item) =>
          item.id === fefoBatch.id
            ? { ...item, cartQuantity: item.cartQuantity + 1 }
            : item
        );
      }

      // Add new cart entry
      return [
        ...prevCart,
        {
          ...fefoBatch,
          cartQuantity: 1,
          availableBatches: batches, // keep reference to alternate batches for manual override
        },
      ];
    });

    setSearchInput('');
    setIsDropdownOpen(false);
    focusSearchInput();
  };

  /**
   * Hardware Barcode Scanner & Enter Key Handler
   * Barcode scanners emit the full code followed by Enter.
   */
  const handleBarcodeSubmit = async (e) => {
    e.preventDefault();
    const term = searchInput.trim();
    if (!term) return;

    let databaseMatches;
    try {
      databaseMatches = await searchMedicines(term);
    } catch (err) {
      console.error('Failed to search IndexedDB medicines for barcode:', err);
      setInventoryError(`Unable to search inventory: ${err.message}`);
      return;
    }

    // 1. Check exact barcode match
    const exactBarcodeMatches = databaseMatches.filter(
      (m) => (m.barcode || '').trim().toLowerCase() === term.toLowerCase()
    );

    if (exactBarcodeMatches.length > 0) {
      // Sort FEFO and pick earliest expiring batch with stock
      exactBarcodeMatches.sort((a, b) => new Date(a.expiryDate) - new Date(b.expiryDate));
      const target = exactBarcodeMatches.find((m) => Number(m.quantity) > 0) || exactBarcodeMatches[0];
      handleAddToCart(target);
      return;
    }

    // 2. If no exact barcode, check if top matching medicine exists
    if (databaseMatches.length > 0) {
      handleAddToCart(databaseMatches[0]);
    } else {
      showWarning(`No medication found matching code: "${term}"`);
    }
  };

  // Switch batch manually in cart
  const handleSwitchBatch = (cartItemId, newBatchId) => {
    const newBatch = medicines.find((m) => m.id === newBatchId);
    if (!newBatch) return;

    if (isBatchExpired(newBatch.expiryDate)) {
      showWarning(`EXPIRED - BLOCKED: Batch ${newBatch.batchNo} cannot be selected for sale.`);
      return;
    }

    const maxStock = Number(newBatch.quantity || 0);
    if (maxStock <= 0) {
      showWarning(`Batch ${newBatch.batchNo} is currently out of stock.`);
      return;
    }

    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id === cartItemId) {
          return {
            ...newBatch,
            cartQuantity: Math.min(item.cartQuantity, maxStock),
            availableBatches: item.availableBatches,
          };
        }
        return item;
      })
    );
  };

  // Modify quantity with stock validation
  const handleUpdateQuantity = (id, delta) => {
    setCart((prevCart) =>
      prevCart
        .map((item) => {
          if (item.id === id) {
            const nextQty = item.cartQuantity + delta;
            const maxStock = Number(item.quantity || 0);

            if (nextQty > maxStock) {
              showWarning(`Cannot exceed available stock (${maxStock} units for Batch ${item.batchNo})`);
              return item;
            }
            return nextQty > 0 ? { ...item, cartQuantity: nextQty } : null;
          }
          return item;
        })
        .filter(Boolean)
    );
  };

  // Direct numeric quantity change
  const handleDirectQuantityChange = (id, newQtyVal) => {
    const qty = parseInt(newQtyVal, 10);
    setCart((prevCart) =>
      prevCart.map((item) => {
        if (item.id === id) {
          if (isNaN(qty) || qty <= 0) return { ...item, cartQuantity: 1 };
          const maxStock = Number(item.quantity || 0);
          if (qty > maxStock) {
            showWarning(`Stock limit: Only ${maxStock} units available`);
            return { ...item, cartQuantity: maxStock };
          }
          return { ...item, cartQuantity: qty };
        }
        return item;
      })
    );
  };

  const handleRemoveFromCart = (id) => {
    setCart((prevCart) => prevCart.filter((item) => item.id !== id));
    focusSearchInput();
  };

  const handleClearCart = () => {
    if (cart.length === 0) return;
    setCart([]);
    focusSearchInput();
  };

  // Calculations
  const subtotal = cart.reduce(
    (acc, item) => acc + (Number(item.sellingPrice) || 0) * (item.cartQuantity || 1),
    0
  );
  const totalItemsCount = cart.reduce((acc, item) => acc + (item.cartQuantity || 1), 0);
  const hasExpiredCartItems = cart.some((item) => isBatchExpired(item.expiryDate));

  // Global Keyboard Shortcuts (F2 Checkout, F4 Clear Cart, / or Esc Focus)
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!isActive) return;

      if (e.key === 'F2') {
        e.preventDefault();
        if (cart.length > 0 && !hasExpiredCartItems && !showCheckoutModal) {
          setShowCheckoutModal(true);
        }
      } else if (e.key === 'F4') {
        e.preventDefault();
        handleClearCart();
      } else if (e.key === '/' && document.activeElement !== searchInputRef.current) {
        e.preventDefault();
        focusSearchInput();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cart, hasExpiredCartItems, isActive, showCheckoutModal]);

  return (
    <div className="flex flex-col h-[calc(100vh-5.5rem)] gap-4 select-none">
      {inventoryError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {inventoryError}
        </div>
      )}
      {hasExpiredCartItems && (
        <div role="alert" className="rounded-xl border-2 border-rose-500 bg-rose-100 px-4 py-3 text-sm font-black tracking-wide text-rose-900">
          EXPIRED - BLOCKED: Remove expired batch items before checkout.
        </div>
      )}

      {/* Stock Warning Toast */}
      {warningToast && (
        <div className="fixed top-20 right-8 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-amber-500 text-white text-xs font-bold shadow-xl border border-amber-600 animate-in slide-in-from-top-3 duration-200">
          <AlertTriangle className="h-4 w-4" />
          <span>{warningToast}</span>
        </div>
      )}

      {/* Top Barcode & Search Command Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-sm flex items-center gap-3">
        <form onSubmit={handleBarcodeSubmit} className="relative flex-1">
          <Barcode className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-emerald-600" />
          <input
            ref={searchInputRef}
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setIsDropdownOpen(true);
            }}
            onFocus={() => setIsDropdownOpen(true)}
            placeholder="Scan Barcode (Auto-Detect) or search medication / salt name... [Press Enter to Add]"
            className="w-full pl-10 pr-24 py-2.5 text-xs font-medium rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 transition shadow-inner font-mono text-slate-800"
            autoComplete="off"
          />

          <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[10px] font-mono text-slate-400 bg-slate-200/60 px-1.5 py-0.5 rounded">
            Enter ↵
          </span>

          {/* Real-time search dropdown */}
          {isDropdownOpen && matchingMedicines.length > 0 && (
            <div className="absolute left-0 right-0 top-full mt-1.5 z-40 bg-white rounded-xl border border-slate-200 shadow-2xl overflow-hidden divide-y divide-slate-100 max-h-80 overflow-y-auto">
              <div className="p-2 bg-slate-50 text-[10px] font-bold text-slate-400 uppercase tracking-wider flex justify-between">
                <span>Matching Medications ({matchingMedicines.length})</span>
                <span>FEFO Auto-Selection Ready</span>
              </div>
              {matchingMedicines.map((med) => {
                const isOutOfStock = Number(med.quantity || 0) <= 0;
                const isExpired = isBatchExpired(med.expiryDate);
                return (
                  <div
                    key={med.id}
                    onClick={() => !isExpired && !isOutOfStock && handleAddToCart(med)}
                    aria-disabled={isExpired || isOutOfStock}
                    className={`p-3 flex items-center justify-between transition ${
                      isExpired
                        ? 'cursor-not-allowed bg-rose-50'
                        : isOutOfStock
                        ? 'cursor-not-allowed opacity-50 bg-slate-50'
                        : 'hover:bg-emerald-50/70'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-slate-900 text-xs truncate">
                          {med.productName}
                        </span>
                        {isExpired && <span className="rounded bg-rose-700 px-1.5 py-0.5 text-[9px] font-black tracking-wide text-white">EXPIRED - BLOCKED</span>}
                        <span className="text-[10px] px-1.5 py-0.2 rounded bg-slate-100 text-slate-600 font-mono">
                          Batch: {med.batchNo}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-500 truncate mt-0.5">
                        {med.saltName} • Code: <span className="font-mono">{med.barcode}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-4 text-right flex-shrink-0">
                      <div>
                        <span className="text-[10px] text-slate-400 block">Expiry</span>
                        <span className={`text-[11px] font-mono ${isExpired ? 'font-black text-rose-700' : 'text-slate-700'}`}>
                          {med.expiryDate}
                        </span>
                      </div>
                      <div>
                        <span className="text-[10px] text-slate-400 block">Stock</span>
                        <span
                          className={`text-xs font-bold ${
                            isOutOfStock ? 'text-rose-600' : 'text-slate-800'
                          }`}
                        >
                          {med.quantity} units
                        </span>
                      </div>
                      <div className="pl-2">
                        <span className="text-sm font-black text-emerald-700">
                          ${Number(med.sellingPrice).toFixed(2)}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </form>

        {/* Quick Clear & POS Indicators */}
        <div className="flex items-center gap-2 flex-shrink-0">
          <button
            onClick={handleClearCart}
            disabled={cart.length === 0}
            className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 disabled:opacity-40 text-slate-600 text-xs font-semibold transition"
            title="Clear Cart (F4)"
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Clear Cart (F4)
          </button>
        </div>
      </div>

      {/* Main Billing Grid: Cart Table & Summary Checkout Panel */}
      <div className="flex-1 flex gap-4 min-h-0">
        {/* Left: Tabular Cart View */}
        <div className="flex-1 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col overflow-hidden">
          {/* Table Header Bar */}
          <div className="p-3 bg-slate-50/80 border-b border-slate-200 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <FileText className="h-4 w-4 text-emerald-600" />
              <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wide">
                Current Prescription Register
              </h3>
            </div>
            <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-0.5 rounded-full border border-emerald-200">
              {cart.length} Distinct Items • {totalItemsCount} Total Units
            </span>
          </div>

          {/* Cart Table Content */}
          <div className="flex-1 overflow-y-auto">
            {cart.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center p-8 text-center text-slate-400">
                <div className="p-4 rounded-2xl bg-slate-100 mb-3 text-slate-300">
                  <Barcode className="h-12 w-12 stroke-1" />
                </div>
                <h4 className="font-bold text-slate-700 text-sm">Register is Ready</h4>
                <p className="text-xs text-slate-400 mt-1 max-w-sm">
                  Scan a medicine barcode or start typing product name above. FEFO batch selection will activate automatically.
                </p>
              </div>
            ) : (
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200 sticky top-0 z-10">
                    <th className="py-2.5 px-3">Medication & Salt</th>
                    <th className="py-2.5 px-3">Batch & Expiry (FEFO)</th>
                    <th className="py-2.5 px-3 text-center">Available Stock</th>
                    <th className="py-2.5 px-3 text-center">Dispensing Qty</th>
                    <th className="py-2.5 px-3 text-right">Unit Rate</th>
                    <th className="py-2.5 px-3 text-right">Line Total</th>
                    <th className="py-2.5 px-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 font-medium">
                  {cart.map((item) => {
                    const maxStock = Number(item.quantity || 0);
                    const lineTotal = (Number(item.sellingPrice) || 0) * item.cartQuantity;

                    return (
                      <tr key={item.id} className="hover:bg-slate-50/70 transition">
                        {/* Name & Salt */}
                        <td className="py-3 px-3">
                          <div className="font-bold text-slate-900 text-xs">
                            {item.productName}
                          </div>
                          <div className="text-[10px] text-slate-500 font-normal">
                            {item.saltName} • <span className="font-mono">{item.barcode}</span>
                          </div>
                        </td>

                        {/* Batch & FEFO Selector */}
                        <td className="py-3 px-3">
                          <div className="flex items-center gap-1.5">
                            {isBatchExpired(item.expiryDate) ? (
                              <span className="rounded bg-rose-700 px-1.5 py-1 text-[9px] font-black text-white">EXPIRED - BLOCKED</span>
                            ) : item.availableBatches && item.availableBatches.length > 1 ? (
                              <select
                                value={item.id}
                                onChange={(e) => handleSwitchBatch(item.id, e.target.value)}
                                className="px-2 py-0.5 rounded border border-slate-300 text-xs font-mono font-bold text-slate-800 bg-white focus:outline-none"
                              >
                                {item.availableBatches.map((b) => (
                                  <option key={b.id} value={b.id} disabled={isBatchExpired(b.expiryDate) || Number(b.quantity) <= 0}>
                                    {b.batchNo} (Exp: {b.expiryDate} • {b.quantity} left)
                                  </option>
                                ))}
                              </select>
                            ) : (
                              <span className="font-mono font-bold text-slate-800">
                                {item.batchNo}
                              </span>
                            )}
                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200">
                              <Sparkles className="h-2.5 w-2.5 text-emerald-600" />
                              FEFO
                            </span>
                          </div>
                          <div className="text-[10px] text-slate-400 font-mono mt-0.5">
                            Exp: {item.expiryDate}
                          </div>
                        </td>

                        {/* Available Stock */}
                        <td className="py-3 px-3 text-center">
                          <span
                            className={`font-bold ${
                              maxStock <= 5 ? 'text-rose-600' : 'text-slate-700'
                            }`}
                          >
                            {maxStock}
                          </span>
                          <span className="text-[10px] text-slate-400"> units</span>
                        </td>

                        {/* Quantity Controls */}
                        <td className="py-3 px-3 text-center">
                          <div className="inline-flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                            <button
                              onClick={() => handleUpdateQuantity(item.id, -1)}
                              className="p-1 rounded bg-white text-slate-600 hover:bg-slate-100 shadow-xs transition"
                            >
                              <Minus className="h-3 w-3" />
                            </button>
                            <input
                              type="number"
                              min="1"
                              max={maxStock}
                              value={item.cartQuantity}
                              onChange={(e) =>
                                handleDirectQuantityChange(item.id, e.target.value)
                              }
                              className="w-12 text-center text-xs font-black bg-transparent text-slate-900 focus:outline-none"
                            />
                            <button
                              onClick={() => handleUpdateQuantity(item.id, 1)}
                              className="p-1 rounded bg-white text-slate-600 hover:bg-slate-100 shadow-xs transition"
                            >
                              <Plus className="h-3 w-3" />
                            </button>
                          </div>
                        </td>

                        {/* Unit Rate */}
                        <td className="py-3 px-3 text-right font-semibold text-slate-700 font-mono">
                          ${Number(item.sellingPrice).toFixed(2)}
                        </td>

                        {/* Line Total */}
                        <td className="py-3 px-3 text-right font-black text-slate-900 font-mono text-xs">
                          ${lineTotal.toFixed(2)}
                        </td>

                        {/* Delete Action */}
                        <td className="py-3 px-3 text-center">
                          <button
                            onClick={() => handleRemoveFromCart(item.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
                            title="Remove item from cart"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>

        {/* Right: Fast Order Summary & Payment Launch Pad */}
        <div className="w-80 bg-white rounded-xl border border-slate-200 shadow-sm flex flex-col justify-between p-4 flex-shrink-0">
          <div>
            <div className="pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Summary & Checkout</h3>
              <p className="text-[11px] text-slate-500">Live POS Ledger Calculation</p>
            </div>

            <div className="py-4 space-y-2.5 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>Items Subtotal:</span>
                <span className="font-bold font-mono text-slate-800">
                  ${subtotal.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Discount / Promo:</span>
                <span className="text-emerald-700 font-medium">Applied in Checkout</span>
              </div>
              <div className="flex justify-between text-slate-600">
                <span>Standard Tax (VAT):</span>
                <span className="text-slate-500 font-mono">Selectable at Pay</span>
              </div>

              <div className="pt-3 border-t border-slate-200 flex justify-between items-baseline">
                <span className="font-bold text-slate-800 text-sm">Total Payable</span>
                <span className="text-2xl font-black text-emerald-700 font-mono">
                  ${subtotal.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Quick Summary Specs */}
            <div className="p-3 rounded-xl bg-slate-50 border border-slate-100 text-[11px] text-slate-600 space-y-1">
              <div className="flex justify-between">
                <span>Cashier Shift:</span>
                <span className="font-semibold text-slate-800">{store.defaultOperator}</span>
              </div>
              <div className="flex justify-between">
                <span>Print Target:</span>
                <span className="font-semibold text-slate-800">80mm Thermal</span>
              </div>
            </div>
          </div>

          <div className="space-y-2 pt-4">
            <button
              onClick={() => !hasExpiredCartItems && setShowCheckoutModal(true)}
              disabled={cart.length === 0 || hasExpiredCartItems}
              className="w-full py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] disabled:bg-slate-300 text-white font-extrabold text-sm shadow-lg shadow-emerald-700/25 transition flex items-center justify-center gap-2"
            >
              <Banknote className="h-5 w-5" />
              Pay & Checkout (F2)
            </button>
            <p className="text-[10px] text-center text-slate-400">
              Press <kbd className="px-1 py-0.5 rounded bg-slate-100 border text-slate-600 font-mono">F2</kbd> anywhere to open checkout
            </p>
          </div>
        </div>
      </div>

      {/* CHECKOUT MODAL */}
      {showCheckoutModal && (
        <CheckoutModal
          cart={cart}
          subtotal={subtotal}
          onClose={() => {
            setShowCheckoutModal(false);
            focusSearchInput();
          }}
          onSuccess={(saleRecord) => {
            setShowCheckoutModal(false);
            setCart([]); // Reset cart
            setCompletedSale(saleRecord); // Trigger receipt view
            fetchInventory(); // Live reload inventory quantities
          }}
        />
      )}

      {/* 80mm THERMAL RECEIPT MODAL */}
      {completedSale && (
        <ReceiptModal
          sale={completedSale}
          onClose={() => {
            setCompletedSale(null);
            focusSearchInput();
          }}
          onNewSale={() => {
            setCompletedSale(null);
            focusSearchInput();
          }}
        />
      )}
    </div>
  );
}
