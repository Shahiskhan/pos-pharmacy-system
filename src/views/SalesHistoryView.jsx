import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Calendar,
  DollarSign,
  Receipt,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Clock,
  User,
  Filter,
  CreditCard,
  Banknote,
  Shield,
  Eye,
  X,
  Loader2,
  ArrowRight,
  Package,
  Check,
} from 'lucide-react';
import { getSales, processReturn } from '../services/localDb';
import ReceiptModal from '../components/pos/ReceiptModal';
import useStoreConfig from '../hooks/useStoreConfig';

export default function SalesHistoryView() {
  const store = useStoreConfig();
  const [sales, setSales] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search and Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all' | 'Completed' | 'Partially Refunded' | 'Fully Refunded'
  const [dateFilter, setDateFilter] = useState('all'); // 'all' | 'today' | 'week'

  // Modals
  const [selectedReceiptSale, setSelectedReceiptSale] = useState(null);
  const [saleToReturn, setSaleToReturn] = useState(null);

  // Return Processing Form State
  const [selectedReturnItems, setSelectedReturnItems] = useState({}); // { [itemId]: { selected: boolean, returnQty: number } }
  const [returnReason, setReturnReason] = useState('Customer Change of Mind');
  const [isProcessingReturn, setIsProcessingReturn] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Load sales history from local IndexedDB
  const fetchSalesData = async () => {
    try {
      const data = await getSales();
      setSales(data);
    } catch (err) {
      console.error('Failed to load sales history:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSalesData();
  }, []);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 4000);
  };

  // KPI calculations
  const { totalGross, totalRefunds, totalNet, todayCount } = useMemo(() => {
    let gross = 0;
    let refunds = 0;
    let net = 0;
    let today = 0;

    const todayStr = new Date().toISOString().split('T')[0];

    sales.forEach((s) => {
      const g = Number(s.grandTotal) || 0;
      const r = Number(s.refundTotal) || 0;
      gross += g;
      refunds += r;
      net += Number(s.netTotal !== undefined ? s.netTotal : g - r);

      if (s.timestamp && s.timestamp.startsWith(todayStr)) {
        today++;
      }
    });

    return {
      totalGross: gross.toFixed(2),
      totalRefunds: refunds.toFixed(2),
      totalNet: net.toFixed(2),
      todayCount: today,
    };
  }, [sales]);

  // Filtered sales records
  const filteredSales = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    return sales.filter((s) => {
      const q = searchQuery.toLowerCase().trim();

      const matchesSearch =
        !q ||
        (s.invoiceNo && s.invoiceNo.toLowerCase().includes(q)) ||
        (s.customerName && s.customerName.toLowerCase().includes(q)) ||
        (s.cashierName && s.cashierName.toLowerCase().includes(q)) ||
        (s.timestamp && s.timestamp.includes(q));

      const status = s.status || 'Completed';
      const matchesStatus =
        statusFilter === 'all' || status.toLowerCase() === statusFilter.toLowerCase();

      let matchesDate = true;
      if (dateFilter === 'today') {
        matchesDate = s.timestamp && s.timestamp.startsWith(todayStr);
      } else if (dateFilter === 'week') {
        matchesDate = s.timestamp && new Date(s.timestamp) >= sevenDaysAgo;
      }

      return matchesSearch && matchesStatus && matchesDate;
    });
  }, [sales, searchQuery, statusFilter, dateFilter]);

  // --- RETURN MODAL HANDLERS ---
  const handleOpenReturnModal = (sale) => {
    setSaleToReturn(sale);

    // Initialize item selection state
    const initialMap = {};
    (sale.items || []).forEach((item) => {
      const originalQty = Number(item.quantity || 1);
      const returnedAlready = Number(item.returnedQuantity || 0);
      const returnable = Math.max(0, originalQty - returnedAlready);

      initialMap[item.id] = {
        selected: false,
        returnQty: returnable > 0 ? 1 : 0,
        maxReturnable: returnable,
        unitPrice: Number(item.sellingPrice) || 0,
        productName: item.productName,
        batchNo: item.batchNo,
      };
    });

    setSelectedReturnItems(initialMap);
    setReturnReason('Customer Change of Mind');
  };

  const handleToggleItemSelect = (itemId) => {
    setSelectedReturnItems((prev) => {
      const itemState = prev[itemId];
      if (!itemState || itemState.maxReturnable <= 0) return prev;
      return {
        ...prev,
        [itemId]: {
          ...itemState,
          selected: !itemState.selected,
        },
      };
    });
  };

  const handleChangeReturnQty = (itemId, newQty) => {
    const qty = parseInt(newQty, 10);
    setSelectedReturnItems((prev) => {
      const itemState = prev[itemId];
      if (!itemState) return prev;
      const validQty = Math.max(1, Math.min(itemState.maxReturnable, isNaN(qty) ? 1 : qty));
      return {
        ...prev,
        [itemId]: {
          ...itemState,
          returnQty: validQty,
        },
      };
    });
  };

  // Calculate live refund amount to give back
  const calculatedRefundTotal = useMemo(() => {
    let sum = 0;
    Object.values(selectedReturnItems).forEach((item) => {
      if (item.selected && item.returnQty > 0) {
        sum += item.unitPrice * item.returnQty;
      }
    });
    return Number(sum.toFixed(2));
  }, [selectedReturnItems]);

  const hasSelectedItems = Object.values(selectedReturnItems).some(
    (i) => i.selected && i.returnQty > 0
  );

  const handleConfirmReturn = async () => {
    if (!saleToReturn || !hasSelectedItems || isProcessingReturn) return;

    setIsProcessingReturn(true);
    try {
      const itemsToReturn = [];
      Object.entries(selectedReturnItems).forEach(([itemId, state]) => {
        if (state.selected && state.returnQty > 0) {
          itemsToReturn.push({
            id: itemId,
            productName: state.productName,
            batchNo: state.batchNo,
            returnQuantity: state.returnQty,
            unitPrice: state.unitPrice,
            lineRefund: Number((state.unitPrice * state.returnQty).toFixed(2)),
          });
        }
      });

      const updatedSale = await processReturn({
        saleId: saleToReturn.id,
        returnedItems: itemsToReturn,
        refundAmount: calculatedRefundTotal,
        reason: returnReason,
        cashierName: store.defaultOperator,
      });

      triggerToast(
        `Refund of $${calculatedRefundTotal.toFixed(2)} processed! Returned items added back to stock.`
      );
      setSaleToReturn(null);
      await fetchSalesData();
    } catch (err) {
      console.error('Failed to process return:', err);
      alert(`Error processing refund: ${err.message}`);
    } finally {
      setIsProcessingReturn(false);
    }
  };

  return (
    <div className="space-y-6 pb-12 select-none">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-2xl border border-slate-700 animate-in slide-in-from-bottom-3 duration-200">
          <CheckCircle2 className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Analytics KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Gross Sales</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            ${totalGross}
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            {sales.length} total lifetime invoices
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Refunds</span>
            <div className="p-1.5 rounded-lg bg-rose-50 text-rose-600 border border-rose-100">
              <RotateCcw className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-rose-600 mt-2 font-mono">
            -${totalRefunds}
          </div>
          <span className="text-[11px] text-rose-600/80 font-medium mt-0.5 block">
            Restocked back to inventory
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Net Revenue</span>
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 border border-teal-100">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-emerald-700 mt-2 font-mono">
            ${totalNet}
          </div>
          <span className="text-[11px] text-emerald-600 font-medium mt-0.5 block">
            Gross minus refunds
          </span>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Today's Activity</span>
            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
              <Clock className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2">
            {todayCount} Orders
          </div>
          <span className="text-[11px] text-slate-400 mt-0.5 block">
            Current shift transactions
          </span>
        </div>
      </div>

      {/* Search & Filter Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-3">
        {/* Search Input */}
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search by Invoice Number, Patient Name, or Cashier..."
            className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition font-medium"
          />
        </div>

        {/* Filter Controls */}
        <div className="flex flex-wrap items-center gap-2 text-xs font-semibold">
          {/* Date Filter */}
          <div className="flex items-center rounded-lg border border-slate-200 bg-slate-50 p-0.5">
            <button
              onClick={() => setDateFilter('all')}
              className={`px-2.5 py-1 rounded-md transition ${
                dateFilter === 'all'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              All Dates
            </button>
            <button
              onClick={() => setDateFilter('today')}
              className={`px-2.5 py-1 rounded-md transition ${
                dateFilter === 'today'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Today
            </button>
            <button
              onClick={() => setDateFilter('week')}
              className={`px-2.5 py-1 rounded-md transition ${
                dateFilter === 'week'
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Last 7 Days
            </button>
          </div>

          {/* Status Filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 font-semibold focus:outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="Completed">Completed</option>
            <option value="Partially Refunded">Partially Refunded</option>
            <option value="Fully Refunded">Fully Refunded</option>
          </select>
        </div>
      </div>

      {/* Sales Invoices Registry Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-400 text-xs gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            Loading sales invoices from local IndexedDB...
          </div>
        ) : filteredSales.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Receipt className="h-10 w-10 text-slate-300 mx-auto stroke-1" />
            <p className="font-semibold text-slate-700">No invoices match your search.</p>
            <p className="text-[11px] text-slate-400">
              Try resetting your search query or switching date filters.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Invoice #</th>
                  <th className="py-3 px-4">Date & Time</th>
                  <th className="py-3 px-4">Patient / Customer</th>
                  <th className="py-3 px-4">Cashier</th>
                  <th className="py-3 px-4 text-center">Payment Mode</th>
                  <th className="py-3 px-4 text-center">Items Dispensed</th>
                  <th className="py-3 px-4 text-right">Net Grand Total</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredSales.map((sale) => {
                  const status = sale.status || 'Completed';
                  const isFullyRefunded = status === 'Fully Refunded';
                  const isPartiallyRefunded = status === 'Partially Refunded';
                  const totalUnits = (sale.items || []).reduce(
                    (sum, i) => sum + (Number(i.quantity) || 1),
                    0
                  );

                  const formattedDate = new Date(sale.timestamp).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const formattedTime = new Date(sale.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });

                  return (
                    <tr
                      key={sale.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isFullyRefunded
                          ? 'bg-rose-50/30'
                          : isPartiallyRefunded
                          ? 'bg-amber-50/20'
                          : ''
                      }`}
                    >
                      {/* Invoice # */}
                      <td className="py-3 px-4 font-mono font-bold text-slate-900 text-xs">
                        {sale.invoiceNo}
                      </td>

                      {/* Date & Time */}
                      <td className="py-3 px-4 text-slate-500">
                        <div>{formattedDate}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{formattedTime}</div>
                      </td>

                      {/* Patient */}
                      <td className="py-3 px-4 text-slate-800 font-semibold">
                        {sale.customerName || 'Walk-in Customer'}
                      </td>

                      {/* Cashier */}
                      <td className="py-3 px-4 text-slate-600">
                        {sale.cashierName || store.defaultOperator}
                      </td>

                      {/* Payment Mode */}
                      <td className="py-3 px-4 text-center">
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                          {sale.paymentMode === 'Cash' && <Banknote className="h-3 w-3 text-emerald-600" />}
                          {sale.paymentMode === 'Card' && <CreditCard className="h-3 w-3 text-blue-600" />}
                          {sale.paymentMode === 'Insurance' && <Shield className="h-3 w-3 text-purple-600" />}
                          {sale.paymentMode || 'Cash'}
                        </span>
                      </td>

                      {/* Items */}
                      <td className="py-3 px-4 text-center">
                        <span className="font-bold text-slate-800">{sale.items?.length || 0}</span>
                        <span className="text-[10px] text-slate-400"> items ({totalUnits}u)</span>
                      </td>

                      {/* Grand Total */}
                      <td className="py-3 px-4 text-right font-mono">
                        <div className="font-black text-slate-900 text-sm">
                          ${Number(sale.netTotal !== undefined ? sale.netTotal : sale.grandTotal).toFixed(2)}
                        </div>
                        {Number(sale.refundTotal) > 0 && (
                          <div className="text-[10px] text-rose-600 font-semibold">
                            (Refunded: -${Number(sale.refundTotal).toFixed(2)})
                          </div>
                        )}
                      </td>

                      {/* Status */}
                      <td className="py-3 px-4 text-center">
                        {isFullyRefunded ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-rose-50 px-2.5 py-0.5 text-[10px] font-bold text-rose-700 border border-rose-200">
                            Fully Refunded
                          </span>
                        ) : isPartiallyRefunded ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-0.5 text-[10px] font-bold text-amber-800 border border-amber-200">
                            Partially Refunded
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[10px] font-bold text-emerald-700 border border-emerald-200">
                            Completed
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          {/* View Receipt */}
                          <button
                            onClick={() => setSelectedReceiptSale(sale)}
                            className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs flex items-center gap-1 transition shadow-xs"
                            title="Re-print Thermal Receipt"
                          >
                            <Receipt className="h-3.5 w-3.5 text-emerald-600" />
                            <span>Receipt</span>
                          </button>

                          {/* Process Return */}
                          <button
                            onClick={() => handleOpenReturnModal(sale)}
                            disabled={isFullyRefunded}
                            className={`px-2.5 py-1.5 rounded-lg border text-xs font-semibold flex items-center gap-1 transition shadow-xs ${
                              isFullyRefunded
                                ? 'opacity-30 cursor-not-allowed bg-slate-50 border-slate-200 text-slate-400'
                                : 'bg-white hover:bg-rose-50 border-slate-200 hover:border-rose-300 text-slate-700 hover:text-rose-700'
                            }`}
                            title="Process Item Return & Stock Restoration"
                          >
                            <RotateCcw className="h-3.5 w-3.5 text-rose-600" />
                            <span>Return</span>
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* MODAL 1: RETURN & REFUND PROCESSING MODAL */}
      {saleToReturn && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
            {/* Header */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-rose-600 text-white shadow">
                  <RotateCcw className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Process Return & Stock Restoration</h3>
                  <p className="text-[11px] text-slate-400 font-mono">
                    Invoice: {saleToReturn.invoiceNo} • {saleToReturn.customerName}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSaleToReturn(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 overflow-y-auto space-y-4 text-xs">
              <p className="text-slate-600 text-xs">
                Select the specific medicines and quantities the customer is returning. The selected units will be automatically restocked into the exact batches in the inventory.
              </p>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden shadow-xs">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-50 text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-200">
                      <th className="py-2.5 px-3 text-center">Select</th>
                      <th className="py-2.5 px-3">Item & Batch</th>
                      <th className="py-2.5 px-3 text-center">Sold Qty</th>
                      <th className="py-2.5 px-3 text-center">Return Qty</th>
                      <th className="py-2.5 px-3 text-right">Unit Price</th>
                      <th className="py-2.5 px-3 text-right">Refund Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {(saleToReturn.items || []).map((item) => {
                      const itemState = selectedReturnItems[item.id] || {
                        selected: false,
                        returnQty: 0,
                        maxReturnable: 0,
                        unitPrice: Number(item.sellingPrice) || 0,
                      };

                      const isEligible = itemState.maxReturnable > 0;
                      const lineRefund = (itemState.unitPrice * itemState.returnQty).toFixed(2);

                      return (
                        <tr
                          key={item.id}
                          className={`hover:bg-slate-50 transition ${
                            itemState.selected ? 'bg-rose-50/40' : !isEligible ? 'opacity-40' : ''
                          }`}
                        >
                          {/* Checkbox */}
                          <td className="py-3 px-3 text-center">
                            <input
                              type="checkbox"
                              disabled={!isEligible}
                              checked={itemState.selected}
                              onChange={() => handleToggleItemSelect(item.id)}
                              className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 h-4 w-4"
                            />
                          </td>

                          {/* Item Details */}
                          <td className="py-3 px-3">
                            <div className="font-bold text-slate-900">{item.productName}</div>
                            <div className="text-[10px] text-slate-500 font-mono">
                              Batch: {item.batchNo} • Code: {item.barcode}
                            </div>
                            {Number(item.returnedQuantity) > 0 && (
                              <div className="text-[10px] text-amber-700">
                                ({item.returnedQuantity} already returned previously)
                              </div>
                            )}
                          </td>

                          {/* Sold Quantity */}
                          <td className="py-3 px-3 text-center font-bold text-slate-700">
                            {item.quantity}
                          </td>

                          {/* Return Quantity Input */}
                          <td className="py-3 px-3 text-center">
                            {isEligible ? (
                              <div className="inline-flex items-center gap-1">
                                <input
                                  type="number"
                                  min="1"
                                  max={itemState.maxReturnable}
                                  value={itemState.returnQty}
                                  disabled={!itemState.selected}
                                  onChange={(e) => handleChangeReturnQty(item.id, e.target.value)}
                                  className="w-14 px-2 py-1 text-center font-bold border border-slate-200 rounded-lg bg-white disabled:bg-slate-100 disabled:text-slate-400 focus:outline-none focus:ring-1 focus:ring-rose-500"
                                />
                                <span className="text-[10px] text-slate-400">/ {itemState.maxReturnable}</span>
                              </div>
                            ) : (
                              <span className="text-[10px] text-slate-400 font-semibold italic">
                                Fully Returned
                              </span>
                            )}
                          </td>

                          {/* Unit Price */}
                          <td className="py-3 px-3 text-right font-mono text-slate-600">
                            ${itemState.unitPrice.toFixed(2)}
                          </td>

                          {/* Line Refund */}
                          <td className="py-3 px-3 text-right font-mono font-bold text-slate-900">
                            {itemState.selected ? `$${lineRefund}` : '$0.00'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Reason Selector */}
              <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                <label className="block font-bold text-slate-700 text-xs">
                  Reason for Return / Restocking *
                </label>
                <select
                  value={returnReason}
                  onChange={(e) => setReturnReason(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-white text-slate-800 text-xs font-medium focus:outline-none focus:ring-1 focus:ring-rose-500"
                >
                  <option value="Customer Change of Mind">Customer Change of Mind</option>
                  <option value="Damaged / Broken Seal">Damaged / Broken Packaging</option>
                  <option value="Incorrect Medicine Dispensed">Incorrect Medicine Dispensed</option>
                  <option value="Doctor Changed Prescription">Doctor Changed Prescription</option>
                  <option value="Expired / Batch Recall">Expired / Batch Clearance</option>
                </select>
              </div>

              {/* Total Refund Banner */}
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 flex items-center justify-between">
                <div>
                  <span className="text-xs font-semibold text-rose-800 uppercase tracking-wide block">
                    Total Amount to Refund Customer:
                  </span>
                  <span className="text-2xl font-black text-rose-700 font-mono mt-0.5 block">
                    ${calculatedRefundTotal.toFixed(2)}
                  </span>
                </div>

                <div className="text-right text-[11px] text-rose-700">
                  <span className="block font-semibold">Atomic Restock Trigger</span>
                  <span>Inventory quantities will be restored immediately.</span>
                </div>
              </div>
            </div>

            {/* Footer Actions */}
            <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
              <button
                type="button"
                onClick={() => setSaleToReturn(null)}
                disabled={isProcessingReturn}
                className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleConfirmReturn}
                disabled={!hasSelectedItems || calculatedRefundTotal <= 0 || isProcessingReturn}
                className="px-5 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-500 disabled:bg-slate-300 text-white font-bold text-xs shadow-md shadow-rose-700/20 transition flex items-center gap-2 active:scale-95"
              >
                {isProcessingReturn ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Restoring Inventory & Processing...
                  </>
                ) : (
                  <>
                    <RotateCcw className="h-4 w-4" />
                    Confirm Return & Restock (${calculatedRefundTotal.toFixed(2)})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: VIEW / RE-PRINT THERMAL RECEIPT */}
      {selectedReceiptSale && (
        <ReceiptModal
          sale={selectedReceiptSale}
          onClose={() => setSelectedReceiptSale(null)}
          onNewSale={() => setSelectedReceiptSale(null)}
        />
      )}
    </div>
  );
}
