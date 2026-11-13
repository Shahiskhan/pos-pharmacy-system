import React, { useState, useEffect, useMemo, useCallback } from 'react';
import * as XLSX from 'xlsx';
import {
  BarChart3,
  TrendingUp,
  Download,
  Calendar,
  DollarSign,
  FileText,
  CreditCard,
  Banknote,
  Shield,
  RotateCcw,
  Loader2,
  Printer,
  FileSpreadsheet,
  PieChart,
  ArrowUpRight,
  CheckCircle2,
  Clock,
  Receipt,
} from 'lucide-react';
import { getSales, getMedicines } from '../services/localDb';
import useStoreConfig from '../hooks/useStoreConfig';
import { printDocument } from '../utils/printing';

export default function ReportsView() {
  const store = useStoreConfig();
  const [sales, setSales] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [dataError, setDataError] = useState(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [activeTab, setActiveTab] = useState('overview'); // 'overview' | 'daily' | 'taxes' | 'top-products'

  const handlePrintReport = async () => {
    try {
      await printDocument('report');
    } catch (error) {
      console.error('Report printing failed:', error);
      window.alert(`Report printing failed: ${error.message}`);
    }
  };

  const loadData = useCallback(async () => {
    try {
      const [salesData, medsData] = await Promise.all([
        getSales(),
        getMedicines(),
      ]);
      setSales(salesData);
      setMedicines(medsData);
      setDataError(null);
    } catch (err) {
      console.error('Failed to load reports data:', err);
      setDataError(`Failed to load report data: ${err.message}`);
    } finally {
      setLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    window.addEventListener('pharmacydbchange', loadData);
    const refreshTimer = window.setInterval(loadData, 30000);
    return () => {
      window.removeEventListener('pharmacydbchange', loadData);
      window.clearInterval(refreshTimer);
    };
  }, [loadData]);

  // Compute Comprehensive Financial Analytics
  const analytics = useMemo(() => {
    let grossRevenue = 0;
    let totalRefunds = 0;
    let netRevenue = 0;
    let totalTax = 0;
    let cogs = 0; // Cost of Goods Sold

    let cashTotal = 0;
    let cardTotal = 0;
    let insuranceTotal = 0;
    let creditTotal = 0;

    let taxableSales = 0;
    let exemptSales = 0;

    const dailyMap = new Map(); // 'YYYY-MM-DD' => { date, count, gross, refunds, net, tax, cash, card, insurance, credit }
    const productMap = new Map(); // 'name' => { name, saltName, category, unitsSold, revenue, cost, profit }

    // Map medicines by ID or Name to look up purchase cost
    const medCostMap = new Map();
    medicines.forEach((m) => {
      medCostMap.set(m.id, Number(m.purchasePrice) || 0);
      medCostMap.set(m.productName.toLowerCase(), Number(m.purchasePrice) || 0);
    });

    sales.forEach((s) => {
      const lineSubtotal = (s.items || []).reduce(
        (sum, item) => sum + (Number(item.sellingPrice) || 0) * (Number(item.quantity) || 0),
        0
      );
      const g = Math.max(0, Number(s.subtotal) || lineSubtotal);
      const discount = Math.max(0, Number(s.discount) || 0);
      const transactionTotal = Math.max(0, Number(s.grandTotal) || (g - discount + (Number(s.tax) || 0)));
      const r = Math.min(transactionTotal, Math.max(0, Number(s.refundTotal) || 0));
      const paidTotal = Math.max(
        0,
        Number(s.netTotal !== undefined ? s.netTotal : transactionTotal - r)
      );
      const t = Math.max(0, Number(s.tax) || 0);
      const n = Math.max(0, paidTotal - t);

      grossRevenue += g;
      totalRefunds += r;
      netRevenue += n;
      totalTax += t;

      if (t > 0) {
        taxableSales += n;
      } else {
        exemptSales += n;
      }

      if (s.paymentMode === 'Card') cardTotal += paidTotal;
      else if (s.paymentMode === 'Insurance') insuranceTotal += paidTotal;
      else if (s.paymentMode === 'Credit / Udhaar') creditTotal += paidTotal;
      else cashTotal += paidTotal;

      // Group by Date
      const dateKey = s.timestamp ? s.timestamp.split('T')[0] : 'Unknown';
      if (!dailyMap.has(dateKey)) {
        dailyMap.set(dateKey, {
          date: dateKey,
          invoices: 0,
          gross: 0,
          refunds: 0,
          net: 0,
          tax: 0,
          cash: 0,
          card: 0,
          insurance: 0,
          credit: 0,
        });
      }
      const dayRec = dailyMap.get(dateKey);
      dayRec.invoices++;
      dayRec.gross += g;
      dayRec.refunds += r;
      dayRec.net += n;
      dayRec.tax += t;
      if (s.paymentMode === 'Card') dayRec.card += paidTotal;
      else if (s.paymentMode === 'Insurance') dayRec.insurance += paidTotal;
      else if (s.paymentMode === 'Credit / Udhaar') dayRec.credit += paidTotal;
      else dayRec.cash += paidTotal;

      // Process Line Items for Product Analytics & COGS
      const salesDiscountFactor = g > 0 ? Math.max(0, (g - discount) / g) : 0;
      (s.items || []).forEach((item) => {
        const name = item.productName || 'General Item';
        const soldUnits = Math.max(
          0,
          (Number(item.quantity) || 0) - (Number(item.returnedQuantity) || 0)
        );
        const unitSelling = Number(item.sellingPrice) || 0;
        const storedCost = Number(item.purchasePrice);
        const unitCost = Number.isFinite(storedCost)
          ? storedCost
          : medCostMap.get(item.id) ?? medCostMap.get(name.toLowerCase()) ?? 0;

        const lineRev = unitSelling * soldUnits * salesDiscountFactor;
        const lineCost = unitCost * soldUnits;

        cogs += lineCost;

        if (!productMap.has(name)) {
          productMap.set(name, {
            name,
            saltName: item.saltName || '—',
            category: item.category || 'Pharmaceutical',
            unitsSold: 0,
            revenue: 0,
            cost: 0,
            profit: 0,
          });
        }
        const pRec = productMap.get(name);
        pRec.unitsSold += soldUnits;
        pRec.revenue += lineRev;
        pRec.cost += lineCost;
        pRec.profit = pRec.revenue - pRec.cost;
      });
    });

    const grossProfit = netRevenue - cogs;
    const netProfit = grossProfit; // In POS context without extra overheads
    const profitMargin = netRevenue > 0 ? (grossProfit / netRevenue) * 100 : 0;

    const dailySummary = Array.from(dailyMap.values()).sort(
      (a, b) => new Date(b.date) - new Date(a.date)
    );

    const topProducts = Array.from(productMap.values())
      .sort((a, b) => b.unitsSold - a.unitsSold || b.revenue - a.revenue)
      .slice(0, 10);

    return {
      grossRevenue: grossRevenue.toFixed(2),
      totalRefunds: totalRefunds.toFixed(2),
      netRevenue: netRevenue.toFixed(2),
      cogs: cogs.toFixed(2),
      grossProfit: grossProfit.toFixed(2),
      netProfit: netProfit.toFixed(2),
      profitMargin: profitMargin.toFixed(1),
      totalTax: totalTax.toFixed(2),
      taxableSales: taxableSales.toFixed(2),
      exemptSales: exemptSales.toFixed(2),
      cashTotal: cashTotal.toFixed(2),
      cardTotal: cardTotal.toFixed(2),
      insuranceTotal: insuranceTotal.toFixed(2),
      creditTotal: creditTotal.toFixed(2),
      dailySummary,
      topProducts,
    };
  }, [sales, medicines]);

  // Export Comprehensive Multi-Tab Excel Audit Report
  const handleExportAuditExcel = () => {
    try {
    // 1. Executive Summary Sheet
    const summaryData = [
      { Metric: 'Report Name', Value: `${store.appName} Financial & Audit Ledger` },
      { Metric: 'Generated At', Value: new Date().toLocaleString() },
      { Metric: 'Cashier / Operator', Value: store.defaultOperator },
      { Metric: 'Total Gross Sales', Value: `$${analytics.grossRevenue}` },
      { Metric: 'Total Refunds Issued', Value: `-$${analytics.totalRefunds}` },
      { Metric: 'Net Sales Revenue', Value: `$${analytics.netRevenue}` },
      { Metric: 'Cost of Goods Sold (COGS)', Value: `$${analytics.cogs}` },
      { Metric: 'Net Profit (before overhead)', Value: `$${analytics.netProfit}` },
      { Metric: 'Profit Margin', Value: `${analytics.profitMargin}%` },
      { Metric: 'Total Tax/VAT Collected', Value: `$${analytics.totalTax}` },
      { Metric: 'Cash In Drawer', Value: `$${analytics.cashTotal}` },
      { Metric: 'Card Terminal Settlements', Value: `$${analytics.cardTotal}` },
      { Metric: 'Insurance Claims', Value: `$${analytics.insuranceTotal}` },
      { Metric: 'Customer Credit Outstanding Sales', Value: `$${analytics.creditTotal}` },
    ];
    const wsSummary = XLSX.utils.json_to_sheet(summaryData);
    wsSummary['!cols'] = [{ wch: 30 }, { wch: 30 }];

    // 2. Daily Sales Sheet
    const dailyRows = analytics.dailySummary.map((d) => ({
      Date: d.date,
      Invoices: d.invoices,
      GrossSales: `$${d.gross.toFixed(2)}`,
      Refunds: `-$${d.refunds.toFixed(2)}`,
      NetSales: `$${d.net.toFixed(2)}`,
      VATCollected: `$${d.tax.toFixed(2)}`,
      Cash: `$${d.cash.toFixed(2)}`,
      Card: `$${d.card.toFixed(2)}`,
      Insurance: `$${d.insurance.toFixed(2)}`,
      Credit: `$${d.credit.toFixed(2)}`,
    }));
    const wsDaily = XLSX.utils.json_to_sheet(dailyRows, {
      header: ['Date', 'Invoices', 'GrossSales', 'Refunds', 'NetSales', 'VATCollected', 'Cash', 'Card', 'Insurance', 'Credit'],
    });

    // 3. Top Products Sheet
    const productRows = analytics.topProducts.map((p) => ({
      Medication: p.name,
      SaltFormula: p.saltName,
      Category: p.category,
      UnitsSold: p.unitsSold,
      Revenue: `$${p.revenue.toFixed(2)}`,
      Cost: `$${p.cost.toFixed(2)}`,
      Profit: `$${p.profit.toFixed(2)}`,
      MarginPercent: p.revenue > 0 ? `${((p.profit / p.revenue) * 100).toFixed(1)}%` : '0%',
    }));
    const wsProducts = XLSX.utils.json_to_sheet(productRows, {
      header: ['Medication', 'SaltFormula', 'Category', 'UnitsSold', 'Revenue', 'Cost', 'Profit', 'MarginPercent'],
    });

    // 4. Tax Sheet
    const taxRows = [
      { TaxType: 'Taxable sales', SalesBase: `$${analytics.taxableSales}`, TaxCollected: `$${analytics.totalTax}` },
      { TaxType: 'Tax-exempt sales', SalesBase: `$${analytics.exemptSales}`, TaxCollected: '$0.00' },
      { TaxType: 'All sales', SalesBase: `$${analytics.netRevenue}`, TaxCollected: `$${analytics.totalTax}` },
    ];
    const wsTax = XLSX.utils.json_to_sheet(taxRows);

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, wsSummary, 'Executive_Summary');
    XLSX.utils.book_append_sheet(workbook, wsDaily, 'Daily_Sales_Ledger');
    XLSX.utils.book_append_sheet(workbook, wsProducts, 'Top_Medications');
    XLSX.utils.book_append_sheet(workbook, wsTax, 'Tax_VAT_Breakdown');

    const dateStr = new Date().toISOString().split('T')[0];
    XLSX.writeFile(workbook, `${store.appName.replace(/[^a-z0-9]+/gi, '_')}_Financial_Audit_${dateStr}.xlsx`);
    } catch (error) {
      window.alert(`Report export failed: ${error.message}`);
    }
  };

  return (
    <div id="printable-report" className="space-y-6 pb-12 select-none">
      {/* Top Header & Export Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <BarChart3 className="h-5 w-5 text-emerald-600" />
            Financial Audit & Analytics Dashboard
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time profit margins, cost analysis, daily ledgers, and tax compliance reports.
          </p>
        </div>

        <div className="flex items-center gap-2.5 print:hidden">
          <button
            onClick={() => {
              setIsRefreshing(true);
              loadData();
            }}
            disabled={isRefreshing}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition disabled:opacity-60"
          >
            {isRefreshing ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
            Refresh
          </button>
          <button
            onClick={handlePrintReport}
            className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold shadow-xs transition"
          >
            <Printer className="h-4 w-4 text-slate-500" />
            Print Audit Slip
          </button>

          <button
            onClick={handleExportAuditExcel}
            className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold shadow-md shadow-emerald-700/20 transition active:scale-95"
          >
            <Download className="h-4 w-4" />
            Download Audit Report (.xlsx)
          </button>
        </div>
      </div>

      {dataError && (
        <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-xs font-medium text-rose-800">
          {dataError}
        </div>
      )}
      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white p-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Loading reports from local database...
        </div>
      )}

      {/* 4 Financial Overview Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Revenue */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Net Revenue</span>
            <div className="p-1.5 rounded-lg bg-emerald-50 text-emerald-600 border border-emerald-100">
              <DollarSign className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            ${analytics.netRevenue}
          </div>
          <div className="text-[11px] text-slate-400 mt-1 flex items-center justify-between">
            <span>Gross: ${analytics.grossRevenue}</span>
            <span className="text-rose-600">Refunds: -${analytics.totalRefunds}</span>
          </div>
        </div>

        {/* Cost of Goods Sold */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Inventory COGS</span>
            <div className="p-1.5 rounded-lg bg-slate-50 text-slate-600 border border-slate-200">
              <FileSpreadsheet className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-800 mt-2 font-mono">
            ${analytics.cogs}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">Wholesale procurement cost recorded at sale</p>
        </div>

        {/* Gross Profit */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Net Profit (before overhead)</span>
            <div className="p-1.5 rounded-lg bg-teal-50 text-teal-600 border border-teal-100">
              <TrendingUp className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-teal-700 mt-2 font-mono">
            ${analytics.netProfit}
          </div>
          <div className="text-[11px] text-emerald-600 font-semibold mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3.5 w-3.5" /> Margin: {analytics.profitMargin}%
          </div>
        </div>

        {/* Tax Collected */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 text-xs font-semibold uppercase tracking-wider">
            <span>Total Tax / VAT</span>
            <div className="p-1.5 rounded-lg bg-blue-50 text-blue-600 border border-blue-100">
              <Receipt className="h-4 w-4" />
            </div>
          </div>
          <div className="text-2xl font-black text-slate-900 mt-2 font-mono">
            ${analytics.totalTax}
          </div>
          <p className="text-[11px] text-slate-400 mt-1">From taxable pharmacy sales</p>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-slate-200 bg-white rounded-t-xl px-4 pt-3 gap-2">
        {[
          { id: 'overview', label: 'Financial Overview', icon: PieChart },
          { id: 'daily', label: 'Daily Sales Ledger', icon: Calendar },
          { id: 'top-products', label: 'Top Medicines & Margins', icon: TrendingUp },
          { id: 'taxes', label: 'Tax & VAT Audit', icon: FileText },
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-2.5 text-xs font-bold border-b-2 transition ${
                isActive
                  ? 'border-emerald-600 text-emerald-700 bg-emerald-50/50'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="h-4 w-4" />
              <span>{tab.label}</span>
            </button>
          );
        })}
      </div>

      {/* TAB 1: OVERVIEW */}
      {activeTab === 'overview' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Payment Method Distribution */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-4">
            <h3 className="font-bold text-slate-800 text-sm">Settlement Channel Distribution</h3>
            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-emerald-100 text-emerald-700">
                    <Banknote className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">Cash Register</span>
                    <span className="text-[10px] text-slate-500">Physical currency in drawer</span>
                  </div>
                </div>
                <span className="font-mono font-black text-slate-900 text-sm">
                  ${analytics.cashTotal}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-blue-100 text-blue-700">
                    <CreditCard className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">Card Terminal</span>
                    <span className="text-[10px] text-slate-500">Credit / Debit electronic payments</span>
                  </div>
                </div>
                <span className="font-mono font-black text-slate-900 text-sm">
                  ${analytics.cardTotal}
                </span>
              </div>

              <div className="p-3 rounded-xl border border-slate-100 bg-slate-50 flex items-center justify-between">
                <div className="flex items-center gap-2.5">
                  <div className="p-2 rounded-lg bg-purple-100 text-purple-700">
                    <Shield className="h-4 w-4" />
                  </div>
                  <div>
                    <span className="font-bold text-slate-900 block">Insurance Claims</span>
                    <span className="text-[10px] text-slate-500">Third-party health claims</span>
                  </div>
                </div>
                <span className="font-mono font-black text-slate-900 text-sm">
                  ${analytics.insuranceTotal}
                </span>
              </div>
            </div>
          </div>

          {/* Quick Financial Health Checklist */}
          <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-sm space-y-3">
            <h3 className="font-bold text-slate-800 text-sm">Audit & Reconciliation Health</h3>
            <div className="space-y-2.5 text-xs text-slate-600">
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-emerald-50 text-emerald-900 border border-emerald-200">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 flex-shrink-0" />
                <span>{sales.length} sales invoices loaded from the local database.</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                <Clock className="h-4 w-4 text-slate-500 flex-shrink-0" />
                <span>Inventory stock counts sync atomically with every sale & refund.</span>
              </div>
              <div className="flex items-center gap-2 p-2.5 rounded-lg bg-slate-50 text-slate-700 border border-slate-200">
                <DollarSign className="h-4 w-4 text-slate-500 flex-shrink-0" />
                <span>Estimated profit margin is running strong at <strong>{analytics.profitMargin}%</strong>.</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: DAILY SALES SUMMARY */}
      {activeTab === 'daily' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 flex justify-between items-center bg-slate-50/70">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Day-by-Day Financial Breakdown
            </h3>
            <span className="text-xs text-slate-500 font-mono">
              {analytics.dailySummary.length} Active Days
            </span>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-4">Date</th>
                  <th className="py-2.5 px-4 text-center">Invoices</th>
                  <th className="py-2.5 px-4 text-right">Gross Sales</th>
                  <th className="py-2.5 px-4 text-right">Refunds</th>
                  <th className="py-2.5 px-4 text-right">Net Sales</th>
                  <th className="py-2.5 px-4 text-right">VAT (5%)</th>
                  <th className="py-2.5 px-4 text-right">Cash</th>
                  <th className="py-2.5 px-4 text-right">Card</th>
                  <th className="py-2.5 px-4 text-right">Insurance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium font-mono">
                {analytics.dailySummary.map((d, idx) => (
                  <tr key={idx} className="hover:bg-slate-50 transition">
                    <td className="py-3 px-4 font-bold text-slate-900 font-sans">{d.date}</td>
                    <td className="py-3 px-4 text-center font-sans">{d.invoices}</td>
                    <td className="py-3 px-4 text-right">${d.gross.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-rose-600">-${d.refunds.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right font-bold text-emerald-700">${d.net.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right text-slate-500">${d.tax.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">${d.cash.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">${d.card.toFixed(2)}</td>
                    <td className="py-3 px-4 text-right">${d.insurance.toFixed(2)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: TOP MEDICINES & PROFIT MARGINS */}
      {activeTab === 'top-products' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
          <div className="p-4 border-b border-slate-100 bg-slate-50/70">
            <h3 className="font-bold text-slate-800 text-xs uppercase tracking-wider">
              Top Dispensed Medications & Profit Margins
            </h3>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200">
                  <th className="py-2.5 px-4">Medication & Salt</th>
                  <th className="py-2.5 px-4">Category</th>
                  <th className="py-2.5 px-4 text-center">Net Units Sold</th>
                  <th className="py-2.5 px-4 text-right">Revenue</th>
                  <th className="py-2.5 px-4 text-right">Procurement Cost</th>
                  <th className="py-2.5 px-4 text-right">Net Profit</th>
                  <th className="py-2.5 px-4 text-right">Margin %</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {analytics.topProducts.map((p, idx) => {
                  const margin = p.revenue > 0 ? ((p.profit / p.revenue) * 100).toFixed(1) : 0;
                  return (
                    <tr key={idx} className="hover:bg-slate-50 transition">
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900">{p.name}</div>
                        <div className="text-[10px] text-slate-500">{p.saltName}</div>
                      </td>
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]">
                          {p.category}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-slate-800">{p.unitsSold} units</td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-slate-900">
                        ${p.revenue.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono text-slate-500">
                        ${p.cost.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-bold text-emerald-700">
                        ${p.profit.toFixed(2)}
                      </td>
                      <td className="py-3 px-4 text-right font-mono font-semibold text-emerald-600">
                        {margin}%
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: TAXES */}
      {activeTab === 'taxes' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-5 space-y-4">
          <h3 className="font-bold text-slate-800 text-sm">Value Added Tax (VAT / GST) Compliance</h3>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                Taxable Sales
              </span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                ${analytics.taxableSales}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">Taxable medication sales</span>
            </div>

            <div className="p-4 rounded-xl border border-slate-200 bg-slate-50">
              <span className="text-slate-400 font-semibold uppercase text-[10px] block">
                Tax-Exempt Sales (0%)
              </span>
              <span className="text-xl font-bold font-mono text-slate-900 mt-1 block">
                ${analytics.exemptSales}
              </span>
              <span className="text-[11px] text-slate-500 mt-0.5 block">Essential medications</span>
            </div>

            <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50">
              <span className="text-emerald-800 font-semibold uppercase text-[10px] block">
                Total VAT Collected
              </span>
              <span className="text-xl font-black font-mono text-emerald-700 mt-1 block">
                ${analytics.totalTax}
              </span>
              <span className="text-[11px] text-emerald-800 mt-0.5 block">Payable to tax authority</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
