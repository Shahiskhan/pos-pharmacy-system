import React, { useEffect } from 'react';
import { Printer, X } from 'lucide-react';

const CODE39_PATTERNS = {
  '0': 'nnnwwnwnn', '1': 'wnnwnnnnw', '2': 'nnwwnnnnw', '3': 'wnwwnnnnn',
  '4': 'nnnwwnnnw', '5': 'wnnwwnnnn', '6': 'nnwwwnnnn', '7': 'nnnwnnwnw',
  '8': 'wnnwnnwnn', '9': 'nnwwnnwnn', A: 'wnnnnwnnw', B: 'nnwnnwnnw',
  C: 'wnwnnwnnn', D: 'nnnnwwnnw', E: 'wnnnwwnnn', F: 'nnwnwwnnn',
  G: 'nnnnnwwnw', H: 'wnnnnwwnn', I: 'nnwnnwwnn', J: 'nnnnwwwnn',
  K: 'wnnnnnnww', L: 'nnwnnnnww', M: 'wnwnnnnwn', N: 'nnnnwnnww',
  O: 'wnnnwnnwn', P: 'nnwnwnnwn', Q: 'nnnnwnwnw', R: 'wnnnwnwnn',
  S: 'nnwnnwnwn', T: 'nnnnwnwwn', U: 'wwnnnnnnw', V: 'nwwnnnnnw',
  W: 'wwwnnnnnn', X: 'nwnnwnnwn', Y: 'wwnnwnnnn', Z: 'nwwnwnnnn',
  '-': 'nwnnnnwnw', '.': 'wwnnnnwnn', ' ': 'nwwnnnwnn', '$': 'nwnwnwnnn',
  '/': 'nwnwnnnwn', '+': 'nwnnnwnwn', '%': 'nnnwnwnwn', '*': 'nwnnwnwnn',
};

function BarcodeSvg({ value }) {
  const encodedValue = `*${String(value || '').toUpperCase()}*`;
  const moduleWidth = 1;
  let x = 10;
  const bars = [];

  for (const character of encodedValue) {
    const pattern = CODE39_PATTERNS[character];
    if (!pattern) return null;

    for (let index = 0; index < pattern.length; index += 1) {
      const width = pattern[index] === 'w' ? 3 : 1;
      if (index % 2 === 0) {
        bars.push(<rect key={`${character}-${x}`} x={x} y="0" width={width} height="28" />);
      }
      x += width * moduleWidth;
    }
    x += moduleWidth;
  }

  return (
    <svg
      className="w-full max-w-56 h-7 text-slate-950"
      viewBox={`0 0 ${x + 10} 28`}
      role="img"
      aria-label={`Code 39 barcode for ${value}`}
      preserveAspectRatio="xMidYMid meet"
    >
      <g fill="currentColor">{bars}</g>
    </svg>
  );
}

export default function ReceiptModal({ sale, onClose, onNewSale }) {
  const handlePrint = () => window.print();

  // Keyboard shortcut: Enter or P to print, Escape to close
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'p' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        handlePrint();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  if (!sale) return null;

  const formattedDate = new Date(sale.timestamp || Date.now()).toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });

  const formattedTime = new Date(sale.timestamp || Date.now()).toLocaleTimeString('en-US', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: true,
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto print:p-0 print:bg-white print:static">
      <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden print:border-none print:shadow-none print:w-auto print:max-w-none">
        {/* Modal Top Bar (Hidden in print) */}
        <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg bg-emerald-600 flex items-center justify-center font-bold text-white text-xs">
              Rx
            </div>
            <div>
              <h3 className="font-bold text-sm leading-tight">Sale Completed Successfully</h3>
              <p className="text-[11px] text-slate-400 font-mono">{sale.invoiceNo}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Action Buttons Toolbar (Hidden in print) */}
        <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 print:hidden">
          <span className="text-xs text-slate-500 font-medium pl-1">
            Standard 80mm Thermal Receipt
          </span>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrint}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-700/20 transition flex items-center gap-1.5 active:scale-95"
            >
              <Printer className="h-4 w-4" />
              Print Receipt (Ctrl+P)
            </button>
            <button
              onClick={onNewSale || onClose}
              className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 font-semibold text-xs transition"
            >
              New Order (F2)
            </button>
          </div>
        </div>

        {/* 80mm Thermal Receipt Layout Container */}
        <div className="p-6 bg-slate-100 flex justify-center print:p-0 print:bg-white">
          <div
            id="printable-receipt"
            className="w-[78mm] bg-white p-4 shadow-sm border border-slate-200 font-mono text-slate-900 text-[11px] leading-tight select-text print:border-none print:shadow-none print:p-2 print:w-[78mm]"
          >
            {/* Pharmacy Header */}
            <div className="text-center pb-3 border-b border-dashed border-slate-400 space-y-1">
              <h2 className="text-base font-black tracking-tight uppercase">Hafiz Pharmacy POS</h2>
              <p className="text-[10px] text-slate-600 font-sans font-medium">
                Pharmacy Terminal • Counter #01
              </p>
              <p className="text-[10px] text-slate-600 font-sans">
                Plot #42, Commercial Avenue, Health City
              </p>
              <p className="text-[10px] text-slate-600 font-sans">
                Tel: +1 (555) 789-0123 • Reg: DL-9921-2026
              </p>
            </div>

            {/* Receipt Metadata */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[10px]">
              <div className="flex justify-between">
                <span className="text-slate-500">INVOICE:</span>
                <span className="font-bold text-slate-900">{sale.invoiceNo}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">DATE:</span>
                <span>{formattedDate} {formattedTime}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">CASHIER:</span>
                <span className="font-semibold">{sale.cashierName || 'Muhammad Shahis'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PATIENT:</span>
                <span>{sale.customerName || 'Walk-in Customer'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-slate-500">PAY MODE:</span>
                <span className="font-bold uppercase">{sale.paymentMode || 'Cash'}</span>
              </div>
            </div>

            {/* Itemized Table */}
            <div className="py-2.5 border-b border-dashed border-slate-400">
              <div className="flex justify-between font-bold text-[10px] pb-1.5 border-b border-slate-300 uppercase">
                <span className="w-1/2">Item Description</span>
                <span className="w-1/4 text-center">Qty x Rate</span>
                <span className="w-1/4 text-right">Amount</span>
              </div>

              <div className="space-y-2 pt-1.5">
                {sale.items && sale.items.map((item, index) => {
                  const qty = item.quantity || item.cartQuantity || 1;
                  const price = Number(item.sellingPrice || 0);
                  const lineTotal = Number(item.subtotal || price * qty);

                  return (
                    <div key={index} className="text-[10px]">
                      <div className="font-bold truncate text-slate-900">{item.productName}</div>
                      <div className="flex justify-between text-slate-600 text-[9px]">
                        <span>Batch: {item.batchNo || '—'}</span>
                        <span>{qty} × ${price.toFixed(2)}</span>
                        <span className="font-bold text-slate-900">${lineTotal.toFixed(2)}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Totals & Calculations Summary */}
            <div className="py-2.5 border-b border-dashed border-slate-400 space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-600">
                <span>Subtotal:</span>
                <span>${Number(sale.subtotal || 0).toFixed(2)}</span>
              </div>

              {Number(sale.discount) > 0 && (
                <div className="flex justify-between text-emerald-700 font-semibold">
                  <span>Discount Applied:</span>
                  <span>-${Number(sale.discount).toFixed(2)}</span>
                </div>
              )}

              {Number(sale.tax) > 0 && (
                <div className="flex justify-between text-slate-600">
                  <span>Tax / VAT:</span>
                  <span>${Number(sale.tax).toFixed(2)}</span>
                </div>
              )}

              <div className="flex justify-between text-sm font-black pt-1 border-t border-slate-300 text-slate-950">
                <span>NET TOTAL:</span>
                <span>${Number(sale.grandTotal || 0).toFixed(2)}</span>
              </div>

              {sale.paymentMode === 'Cash' && (
                <>
                  <div className="flex justify-between text-slate-600 pt-1 text-[10px]">
                    <span>Cash Tendered:</span>
                    <span>${Number(sale.cashTendered || 0).toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between font-bold text-emerald-800 text-xs">
                    <span>Change Returned:</span>
                    <span>${Number(sale.changeReturned || 0).toFixed(2)}</span>
                  </div>
                </>
              )}
            </div>

            {/* Footer Notice & Barcode Indicator */}
            <div className="pt-3 text-center space-y-2">
              <p className="text-[9px] text-slate-600 italic leading-snug">
                Medicines once sold cannot be returned without original cash receipt.
              </p>
              <p className="text-[10px] font-bold text-slate-800">
                Stay healthy & get well soon!
              </p>

              {/* Barcode representation */}
              <div className="pt-2 flex flex-col items-center justify-center opacity-80">
                <BarcodeSvg value={sale.invoiceNo} />
                <span className="text-[9px] font-mono text-slate-500 mt-0.5">
                  {sale.invoiceNo}
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
