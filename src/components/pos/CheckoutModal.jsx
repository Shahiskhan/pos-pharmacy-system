import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  Banknote,
  CreditCard,
  Shield,
  X,
  CheckCircle2,
  DollarSign,
  Percent,
  User,
  AlertTriangle,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { getCustomers, recordSale } from '../../services/localDb';
import useStoreConfig from '../../hooks/useStoreConfig';

export default function CheckoutModal({ cart, subtotal, onClose, onSuccess }) {
  const store = useStoreConfig();
  const [customerName, setCustomerName] = useState('Walk-in Customer');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customers, setCustomers] = useState([]);
  const [paymentMode, setPaymentMode] = useState('Cash');

  // Discounts & Tax
  const [discountType, setDiscountType] = useState('percent'); // 'percent' | 'fixed'
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPercent, setTaxPercent] = useState(0); // 0% by default, or 5%

  // Cash Tendered
  const [cashTenderedStr, setCashTenderedStr] = useState('');
  const [cashTenderedEdited, setCashTenderedEdited] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState(null);

  const cashInputRef = useRef(null);

  // Compute live totals
  const { discountAmount, taxAmount, grandTotal } = useMemo(() => {
    const safeSubtotal = Number.isFinite(Number(subtotal)) ? Math.max(0, Number(subtotal)) : 0;
    const enteredDiscount = Number(discountValue);
    const val = Number.isFinite(enteredDiscount) ? Math.max(0, enteredDiscount) : 0;
    let disc = 0;
    if (discountType === 'percent') {
      disc = (safeSubtotal * Math.min(100, val)) / 100;
    } else {
      disc = Math.min(safeSubtotal, val);
    }

    const roundedDiscount = Number(disc.toFixed(2));
    const afterDiscount = Math.max(0, Number((safeSubtotal - roundedDiscount).toFixed(2)));
    const enteredTax = Number(taxPercent);
    const safeTaxPercent = Number.isFinite(enteredTax) ? Math.min(100, Math.max(0, enteredTax)) : 0;
    const tax = Number(((afterDiscount * safeTaxPercent) / 100).toFixed(2));
    const total = Math.max(0, Number((afterDiscount + tax).toFixed(2)));

    return {
      discountAmount: roundedDiscount,
      taxAmount: tax,
      grandTotal: total,
    };
  }, [subtotal, discountType, discountValue, taxPercent]);

  // Keep the default tender aligned with the total until the cashier edits it.
  useEffect(() => {
    if (!cashTenderedEdited) {
      setCashTenderedStr(grandTotal.toFixed(2));
    }
  }, [cashTenderedEdited, grandTotal]);

  // Auto-focus cash input when modal opens
  useEffect(() => {
    if (paymentMode === 'Cash' && cashInputRef.current) {
      cashInputRef.current.focus();
      cashInputRef.current.select();
    }
  }, [paymentMode]);

  const enteredCash = Number(cashTenderedStr);
  const cashTendered = Number.isFinite(enteredCash) ? Math.max(0, enteredCash) : 0;
  const changeReturned = Math.max(0, Number((cashTendered - grandTotal).toFixed(2)));
  const isShortOfCash = paymentMode === 'Cash' && cashTendered < grandTotal;
  const isCredit = paymentMode === 'Credit / Udhaar';

  useEffect(() => {
    if (!isCredit) return;
    getCustomers()
      .then(setCustomers)
      .catch((error) => {
        console.error('Failed to load customers for credit checkout:', error);
        setErrorMessage(`Unable to load customer accounts: ${error.message}`);
      });
  }, [isCredit]);

  // Quick cash tender helper buttons
  const getQuickTenders = () => {
    const ceilTen = Math.ceil(grandTotal / 10) * 10;
    const ceilFifty = Math.ceil(grandTotal / 50) * 50;
    const ceilHundred = Math.ceil(grandTotal / 100) * 100;
    const values = [grandTotal, ceilTen, ceilFifty, ceilHundred];
    return Array.from(new Set(values.filter((v) => v >= grandTotal)));
  };

  const handleCompleteCheckout = async () => {
    if (cart.length === 0 || isSubmitting) return;

    if (isShortOfCash) {
      setErrorMessage(`Tendered cash ($${cashTendered.toFixed(2)}) is less than total payable ($${grandTotal.toFixed(2)}).`);
      return;
    }
    if (isCredit && (!customerName.trim() || !customerPhone.trim())) {
      setErrorMessage('Enter the customer name and phone number to record this credit sale.');
      return;
    }

    setIsSubmitting(true);
    setErrorMessage(null);

    try {
      const saleItems = cart.map((item) => ({
        id: item.id,
        productName: item.productName,
        saltName: item.saltName,
        batchNo: item.batchNo,
        barcode: item.barcode,
        sellingPrice: Number(item.sellingPrice),
        purchasePrice: Number(item.purchasePrice) || 0,
        category: item.category,
        quantity: Number(item.cartQuantity || item.quantity || 1),
        subtotal: Number((item.sellingPrice * (item.cartQuantity || item.quantity || 1)).toFixed(2)),
      }));

      const saleRecord = await recordSale({
        items: saleItems,
        subtotal,
        discount: discountAmount,
        tax: taxAmount,
        grandTotal,
        paymentMode,
        cashTendered: paymentMode === 'Cash' ? cashTendered : (isCredit ? 0 : grandTotal),
        changeReturned: paymentMode === 'Cash' ? changeReturned : 0,
        cashierName: store.defaultOperator,
        customerName,
        customerPhone,
      });

      onSuccess(saleRecord);
    } catch (err) {
      console.error('Checkout failed:', err);
      setErrorMessage(`Checkout transaction error: ${err.message}`);
      setIsSubmitting(false);
    }
  };

  // Keyboard shortcut: Enter to submit, Escape to cancel
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey || document.activeElement === cashInputRef.current)) {
        if (!isShortOfCash) {
          e.preventDefault();
          handleCompleteCheckout();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isShortOfCash, grandTotal, cashTendered, cart, isSubmitting]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 animate-in fade-in duration-200">
      <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Modal Header */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-emerald-600 text-white shadow">
              <Banknote className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-bold text-sm">{store.appName} Checkout</h3>
              <p className="text-[11px] text-slate-400">
                {cart.length} medications • Total units: {cart.reduce((s, i) => s + (i.cartQuantity || 1), 0)}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto space-y-4 text-xs">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-rose-600 flex-shrink-0" />
              <span>{errorMessage}</span>
            </div>
          )}

          {/* Customer Name */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
              <User className="h-3.5 w-3.5 text-slate-400" />
              Patient / Customer Name
            </label>
            <input
              type="text"
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="Walk-in Customer"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-medium text-slate-800"
            />
          </div>

          {/* Payment Mode Selector */}
          <div>
            <label className="block font-semibold text-slate-700 mb-1.5">
              Select Payment Mode
            </label>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {[
                { id: 'Cash', label: 'Cash', icon: Banknote },
                { id: 'Card', label: 'Credit / Debit Card', icon: CreditCard },
                { id: 'Insurance', label: 'Insurance / Credit', icon: Shield },
                { id: 'Credit / Udhaar', label: 'Credit / Udhaar', icon: User },
              ].map((mode) => {
                const Icon = mode.icon;
                const isSelected = paymentMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => setPaymentMode(mode.id)}
                    className={`p-3 rounded-xl border flex flex-col items-center gap-1.5 font-bold transition active:scale-95 ${
                      isSelected
                        ? 'bg-emerald-600 text-white border-emerald-600 shadow-md shadow-emerald-700/20'
                        : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    <span>{mode.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {isCredit && (
            <div className="space-y-3 rounded-xl border border-amber-200 bg-amber-50/60 p-4">
              <label className="block font-semibold text-slate-700">
                Existing Customer (optional)
                <select
                  value=""
                  onChange={(event) => {
                    const customer = customers.find((entry) => entry.id === event.target.value);
                    if (customer) {
                      setCustomerName(customer.name);
                      setCustomerPhone(customer.phone);
                    }
                  }}
                  className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 font-normal"
                >
                  <option value="">Select existing customer or enter a new one</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name} · {customer.phone} · Balance ${Number(customer.balance || 0).toFixed(2)}
                    </option>
                  ))}
                </select>
              </label>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block font-semibold text-slate-700">
                  Customer Name *
                  <input required value={customerName === 'Walk-in Customer' ? '' : customerName} onChange={(event) => setCustomerName(event.target.value)} maxLength="120" placeholder="Full name" className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 font-normal" />
                </label>
                <label className="block font-semibold text-slate-700">
                  Phone Number *
                  <input required type="tel" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} maxLength="32" placeholder="Customer phone" className="mt-1 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 font-normal" />
                </label>
              </div>
              <p className="text-[11px] text-amber-900">This sale will be added to the customer’s outstanding balance.</p>
            </div>
          )}

          {/* Calculations & Discounts */}
          <div className="p-4 rounded-xl border border-slate-200 bg-slate-50/70 space-y-3">
            <div className="flex justify-between items-center text-slate-600 font-medium">
              <span>Gross Cart Subtotal</span>
              <span className="font-bold text-slate-900">${subtotal.toFixed(2)}</span>
            </div>

            {/* Discount Row */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/80">
              <span className="text-slate-600 font-medium">Discount</span>
              <div className="flex items-center gap-2">
                <div className="flex rounded-lg border border-slate-200 bg-white p-0.5 text-[11px]">
                  <button
                    type="button"
                    onClick={() => setDiscountType('percent')}
                    className={`px-2 py-0.5 rounded font-bold ${
                      discountType === 'percent' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    %
                  </button>
                  <button
                    type="button"
                    onClick={() => setDiscountType('fixed')}
                    className={`px-2 py-0.5 rounded font-bold ${
                      discountType === 'fixed' ? 'bg-emerald-600 text-white' : 'text-slate-600'
                    }`}
                  >
                    $
                  </button>
                </div>
                <input
                  type="number"
                  min="0"
                  max={discountType === 'percent' ? 100 : subtotal}
                  step="0.01"
                  value={discountValue}
                  onChange={(e) => {
                    const value = Number(e.target.value);
                    setDiscountValue(e.target.value === '' ? '' : Number.isFinite(value) ? Math.max(0, value) : 0);
                  }}
                  className="w-16 px-2 py-1 rounded-lg border border-slate-200 text-right font-bold text-slate-800 bg-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
                <span className="text-emerald-700 font-bold w-16 text-right">
                  -${discountAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Tax Row */}
            <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-200/80">
              <span className="text-slate-600 font-medium">Tax / VAT</span>
              <div className="flex items-center gap-2">
                <select
                  value={taxPercent}
                  onChange={(e) => setTaxPercent(Number(e.target.value))}
                  className="px-2 py-1 rounded-lg border border-slate-200 text-xs font-semibold bg-white text-slate-700 focus:outline-none"
                >
                  <option value={0}>0% (Tax Exempt)</option>
                  <option value={5}>5% Standard VAT</option>
                  <option value={10}>10% VAT</option>
                </select>
                <span className="text-slate-800 font-bold w-16 text-right">
                  +${taxAmount.toFixed(2)}
                </span>
              </div>
            </div>

            {/* Grand Total */}
            <div className="flex justify-between items-center pt-2 border-t-2 border-slate-300 text-base font-black">
              <span className="text-slate-900">Net Payable Amount</span>
              <span className="text-emerald-700 text-lg">${grandTotal.toFixed(2)}</span>
            </div>
          </div>

          {/* Cash Tendered & Change Section (Visible when Cash selected) */}
          {paymentMode === 'Cash' && (
            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/40 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <label className="font-bold text-slate-800 text-xs">
                  Cash Tendered by Customer *
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-bold">$</span>
                  <input
                    ref={cashInputRef}
                    type="number"
                    step="0.01"
                    min="0"
                    value={cashTenderedStr}
                    onChange={(e) => {
                      setCashTenderedEdited(true);
                      setCashTenderedStr(e.target.value);
                    }}
                    placeholder="0.00"
                    className="w-40 pl-7 pr-3 py-1.5 text-sm font-black rounded-lg border border-slate-300 bg-white text-slate-900 text-right focus:outline-none focus:ring-2 focus:ring-emerald-500/30 focus:border-emerald-500 shadow-sm"
                  />
                </div>
              </div>

              {/* Quick Cash Buttons */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-[11px] text-slate-500 font-semibold mr-1">Quick Select:</span>
                {getQuickTenders().map((amt, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => setCashTenderedStr(amt.toFixed(2))}
                    className="px-2.5 py-1 rounded-lg border border-slate-200 bg-white hover:bg-emerald-50 hover:border-emerald-300 text-slate-800 text-xs font-bold transition shadow-xs"
                  >
                    ${amt.toFixed(2)}
                  </button>
                ))}
              </div>

              {/* Change Calculation Display */}
              <div className="pt-2 border-t border-emerald-200/60 flex items-center justify-between">
                <span className="font-bold text-xs text-slate-700">Change to Return to Customer:</span>
                <span
                  className={`text-base font-black ${
                    isShortOfCash ? 'text-rose-600' : 'text-emerald-700'
                  }`}
                >
                  {isShortOfCash
                    ? `Short by $${(grandTotal - cashTendered).toFixed(2)}`
                    : `$${changeReturned.toFixed(2)}`}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer Actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            disabled={isSubmitting}
            className="px-4 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-semibold transition"
          >
            Cancel (Esc)
          </button>

          <button
            type="button"
            onClick={handleCompleteCheckout}
            disabled={isSubmitting || isShortOfCash || cart.length === 0}
            className="px-6 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold text-xs shadow-md shadow-emerald-700/20 transition flex items-center gap-2 active:scale-95"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Deducting Inventory & Saving...
              </>
            ) : (
              <>
                <CheckCircle2 className="h-4 w-4" />
                Complete Checkout & Print Receipt
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
