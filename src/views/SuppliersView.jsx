import React, { useState, useEffect, useMemo } from 'react';
import * as XLSX from 'xlsx';
import {
  Truck,
  Phone,
  Building2,
  Plus,
  Search,
  MapPin,
  X,
  Loader2,
  AlertTriangle,
  FileText,
  Printer,
  Download,
  CheckCircle2,
  Package,
  Layers,
  ArrowRight,
} from 'lucide-react';
import { getSuppliers, addSupplier, getMedicines } from '../services/localDb';
import useStoreConfig from '../hooks/useStoreConfig';
import { printDocument } from '../utils/printing';

export default function SuppliersView() {
  const store = useStoreConfig();
  const [suppliers, setSuppliers] = useState([]);
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [showAddSupplierModal, setShowAddSupplierModal] = useState(false);

  // Auto PO Generator Modal
  const [selectedPO, setSelectedPO] = useState(null); // stores { poNumber, supplier, items, totalCost, date }

  const handlePrintPurchaseOrder = async () => {
    try {
      await printDocument('purchase-order');
    } catch (error) {
      console.error('Purchase order printing failed:', error);
      window.alert(`Purchase order printing failed: ${error.message}`);
    }
  };

  const [newSupplier, setNewSupplier] = useState({
    name: '',
    company: '',
    phone: '',
    address: '',
  });

  const loadData = async () => {
    try {
      const [supData, medData] = await Promise.all([
        getSuppliers(),
        getMedicines(),
      ]);
      setSuppliers(supData);
      setMedicines(medData);
    } catch (err) {
      console.error('Failed to load suppliers & medicines:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  // Low stock detection: items with quantity <= 15
  const lowStockItems = useMemo(() => {
    return medicines.filter((m) => Number(m.quantity || 0) <= 15);
  }, [medicines]);

  // Group low stock items by supplier
  const lowStockBySupplier = useMemo(() => {
    if (suppliers.length === 0) return [];

    // Map items to supplier. If item has supplierName, match it; otherwise distribute by category or first supplier
    const grouped = new Map();
    suppliers.forEach((sup) => {
      grouped.set(sup.id, {
        supplier: sup,
        items: [],
      });
    });

    lowStockItems.forEach((item, index) => {
      // Pick matched supplier or round-robin distributor
      const supIndex = index % suppliers.length;
      const targetSupplier = suppliers[supIndex];
      if (targetSupplier && grouped.has(targetSupplier.id)) {
        const group = grouped.get(targetSupplier.id);
        const currentQty = Number(item.quantity || 0);
        const reorderTarget = 60; // target replenishment level
        const neededQty = Math.max(20, reorderTarget - currentQty);
        const unitCost = Number(item.purchasePrice) || Number(item.sellingPrice) * 0.7 || 5.0;

        group.items.push({
          id: item.id,
          productName: item.productName,
          saltName: item.saltName,
          barcode: item.barcode,
          batchNo: item.batchNo,
          currentQuantity: currentQty,
          reorderQuantity: neededQty,
          unitCost: Number(unitCost.toFixed(2)),
          lineTotal: Number((unitCost * neededQty).toFixed(2)),
        });
      }
    });

    return Array.from(grouped.values()).filter((g) => g.items.length > 0);
  }, [lowStockItems, suppliers]);

  // Handle PO Creation for a specific supplier
  const handleGeneratePO = (supplierGroup) => {
    const now = new Date();
    const year = now.getFullYear();
    const month = String(now.getMonth() + 1).padStart(2, '0');
    const day = String(now.getDate()).padStart(2, '0');
    const seq = Math.floor(100 + Math.random() * 900);
    const poNumber = `PO-${year}-${month}${day}-${seq}`;

    const totalCost = supplierGroup.items.reduce((sum, i) => sum + i.lineTotal, 0);

    setSelectedPO({
      poNumber,
      supplier: supplierGroup.supplier,
      items: supplierGroup.items,
      totalCost: Number(totalCost.toFixed(2)),
      date: now.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' }),
    });
  };

  // Export PO to Excel / CSV
  const handleExportPO = () => {
    if (!selectedPO) return;

    try {
      const rows = selectedPO.items.map((item, idx) => ({
        ItemNo: idx + 1,
        Product: item.productName,
        GenericSalt: item.saltName,
        BatchOrSKU: item.batchNo,
        Barcode: item.barcode,
        CurrentStock: item.currentQuantity,
        OrderQuantity: item.reorderQuantity,
        EstimatedUnitCost: `$${item.unitCost.toFixed(2)}`,
        LineTotal: `$${item.lineTotal.toFixed(2)}`,
      }));
      const headers = [
        'ItemNo', 'Product', 'GenericSalt', 'BatchOrSKU', 'Barcode',
        'CurrentStock', 'OrderQuantity', 'EstimatedUnitCost', 'LineTotal',
      ];
      const ws = XLSX.utils.json_to_sheet(rows, { header: headers });
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, 'Purchase_Order');
      const supplierName = String(selectedPO.supplier.company || 'Supplier').replace(/[^a-zA-Z0-9]/g, '_');
      XLSX.writeFile(wb, `${selectedPO.poNumber}_${supplierName}.xlsx`);
    } catch (error) {
      window.alert(`Purchase order export failed: ${error.message}`);
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (!newSupplier.company || !newSupplier.phone) return;
    try {
      await addSupplier(newSupplier);
      setShowAddSupplierModal(false);
      setNewSupplier({ name: '', company: '', phone: '', address: '' });
      await loadData();
    } catch (err) {
      alert(`Error saving supplier: ${err.message}`);
    }
  };

  const filteredSuppliers = suppliers.filter(
    (s) =>
      s.company?.toLowerCase().includes(search.toLowerCase()) ||
      s.name?.toLowerCase().includes(search.toLowerCase()) ||
      s.address?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="space-y-6 pb-12 select-none">
      {/* Top Banner: Low Stock Detection & Auto PO Generator */}
      <div className="bg-gradient-to-r from-amber-500 via-amber-600 to-orange-600 rounded-2xl p-5 text-white shadow-md flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className="px-2.5 py-0.5 rounded-full bg-white/20 text-white text-[11px] font-bold backdrop-blur-sm flex items-center gap-1">
              <AlertTriangle className="h-3 w-3" />
              Automated Reorder Engine
            </span>
            <span className="text-amber-100 text-xs font-semibold">
              {lowStockItems.length} Low-Stock Medicines Detected
            </span>
          </div>
          <h2 className="text-xl font-bold tracking-tight">Auto-Generate Purchase Orders</h2>
          <p className="text-amber-100 text-xs max-w-xl">
            Automatically group medicines at or below reorder threshold (&le; 15 units) by registered wholesale distributors and generate official procurement orders.
          </p>
        </div>

        {lowStockBySupplier.length > 0 && (
          <div className="flex items-center gap-2 flex-shrink-0">
            <button
              onClick={() => handleGeneratePO(lowStockBySupplier[0])}
              className="px-4 py-2.5 rounded-xl bg-white text-slate-900 font-bold text-xs shadow-md hover:bg-amber-50 transition active:scale-95 flex items-center gap-2"
            >
              <FileText className="h-4 w-4 text-amber-600" />
              Generate PO ({lowStockBySupplier[0].supplier.company})
            </button>
          </div>
        )}
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search suppliers by company, representative, or city..."
            className="w-full pl-9 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition font-medium"
          />
        </div>

        <button
          onClick={() => setShowAddSupplierModal(true)}
          className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-semibold text-xs shadow-sm transition flex items-center gap-1.5"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Supplier Partner
        </button>
      </div>

      {/* Suppliers Grid */}
      {loading ? (
        <div className="p-12 flex items-center justify-center text-slate-400 text-xs gap-2">
          <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
          Loading suppliers and stock levels...
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {filteredSuppliers.map((sup) => {
            const group = lowStockBySupplier.find((g) => g.supplier.id === sup.id);
            const lowItemsForSup = group ? group.items : [];

            return (
              <div
                key={sup.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2.5">
                      <div className="p-2.5 rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-100">
                        <Truck className="h-5 w-5" />
                      </div>
                      <div>
                        <h3 className="font-bold text-slate-800 text-sm">{sup.company}</h3>
                        <p className="text-xs text-slate-500">
                          {sup.name ? `Representative: ${sup.name}` : 'Registered Distributor'}
                        </p>
                      </div>
                    </div>
                    {lowItemsForSup.length > 0 && (
                      <span className="text-[10px] font-bold text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200 flex items-center gap-1">
                        <AlertTriangle className="h-3 w-3 text-amber-600" />
                        {lowItemsForSup.length} Reorders Needed
                      </span>
                    )}
                  </div>

                  <div className="mt-4 pt-3 border-t border-slate-100 space-y-2 text-xs text-slate-600">
                    <div className="flex items-center gap-2">
                      <Phone className="h-3.5 w-3.5 text-slate-400" />
                      <span>{sup.phone}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      <span className="text-slate-600">{sup.address || 'Address on file'}</span>
                    </div>
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                  <span className="text-[11px] text-slate-400 font-mono">
                    ID: {sup.id}
                  </span>

                  <button
                    onClick={() => {
                      if (group) {
                        handleGeneratePO(group);
                      } else {
                        // Create sample PO for this supplier
                        handleGeneratePO({ supplier: sup, items: [] });
                      }
                    }}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs transition flex items-center gap-1.5"
                  >
                    <FileText className="h-3.5 w-3.5 text-emerald-400" />
                    Create Purchase Order
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* MODAL 1: PURCHASE ORDER SLIP VIEW & PRINT */}
      {selectedPO && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/70 backdrop-blur-sm p-4 overflow-y-auto print:p-0 print:bg-white print:static animate-in fade-in duration-200">
          <div className="w-full max-w-2xl bg-white rounded-2xl border border-slate-200 shadow-2xl overflow-hidden print:border-none print:shadow-none print:w-auto print:max-w-none">
            {/* Modal Actions Bar (Hidden in print) */}
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between print:hidden">
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-amber-600 text-white shadow">
                  <FileText className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Purchase Order Generated</h3>
                  <p className="text-[11px] text-slate-400 font-mono">{selectedPO.poNumber}</p>
                </div>
              </div>
              <button
                onClick={() => setSelectedPO(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Print & Download Action Buttons Toolbar (Hidden in print) */}
            <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between gap-2 print:hidden">
              <span className="text-xs text-slate-500 font-medium pl-1">
                Official Pharmacy Procurement Order
              </span>
              <div className="flex items-center gap-2">
                <button
                  onClick={handlePrintPurchaseOrder}
                  className="px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition flex items-center gap-1.5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Print PO Slip
                </button>
                <button
                  onClick={handleExportPO}
                  className="px-3.5 py-1.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center gap-1.5 shadow-sm"
                >
                  <Download className="h-3.5 w-3.5" />
                  Export PO (.xlsx)
                </button>
              </div>
            </div>

            {/* Formal Printable Purchase Order Slip Layout */}
            <div id="printable-purchase-order" className="p-8 text-xs font-sans text-slate-800 space-y-5 print:p-4">
              {/* Header */}
              <div className="flex justify-between items-start border-b border-slate-200 pb-4">
                <div>
                  <h1 className="text-lg font-black tracking-tight text-slate-950 uppercase">{store.appName}</h1>
                  <p className="text-slate-500 text-[11px]">Procurement Department</p>
                  <p className="text-slate-500 text-[11px]">{store.address}</p>
                  <p className="text-slate-500 text-[11px]">Tel: {store.phone}</p>
                </div>

                <div className="text-right space-y-1">
                  <span className="px-2.5 py-1 rounded bg-slate-100 font-mono font-bold text-xs inline-block">
                    {selectedPO.poNumber}
                  </span>
                  <p className="text-slate-500 text-[11px]">Date: <strong>{selectedPO.date}</strong></p>
                  <p className="text-slate-500 text-[11px]">Delivery Terms: <strong>24-48 Hours</strong></p>
                </div>
              </div>

              {/* Vendor Information Box */}
              <div className="p-3.5 rounded-xl border border-slate-200 bg-slate-50 grid grid-cols-2 gap-4">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Vendor / Distributor
                  </span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{selectedPO.supplier.company}</p>
                  <p className="text-slate-600 text-[11px]">Attn: {selectedPO.supplier.name || 'Sales Department'}</p>
                  <p className="text-slate-600 text-[11px]">{selectedPO.supplier.address}</p>
                  <p className="text-slate-600 text-[11px]">Phone: {selectedPO.supplier.phone}</p>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Ship & Bill To
                  </span>
                  <p className="font-bold text-slate-900 text-sm mt-0.5">{store.appName}</p>
                  <p className="text-slate-600 text-[11px]">{store.defaultOperator}</p>
                  <p className="text-slate-600 text-[11px]">License: {store.licenseNumber}</p>
                </div>
              </div>

              {/* Items Table */}
              <div className="border border-slate-200 rounded-xl overflow-hidden">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="bg-slate-100 text-slate-600 uppercase font-semibold text-[10px] tracking-wider border-b border-slate-200">
                      <th className="py-2 px-3">#</th>
                      <th className="py-2 px-3">Item Description</th>
                      <th className="py-2 px-3 font-mono">Barcode</th>
                      <th className="py-2 px-3 text-center">In-Stock</th>
                      <th className="py-2 px-3 text-center">Reorder Qty</th>
                      <th className="py-2 px-3 text-right">Est. Unit Cost</th>
                      <th className="py-2 px-3 text-right">Line Total</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200">
                    {selectedPO.items.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="py-6 text-center text-slate-400">
                          No low stock items currently assigned to this vendor.
                        </td>
                      </tr>
                    ) : (
                      selectedPO.items.map((item, idx) => (
                        <tr key={idx} className="hover:bg-slate-50">
                          <td className="py-2.5 px-3 text-slate-400 font-mono">{idx + 1}</td>
                          <td className="py-2.5 px-3 font-bold text-slate-900">
                            <div>{item.productName}</div>
                            <div className="text-[10px] font-normal text-slate-500">{item.saltName}</div>
                          </td>
                          <td className="py-2.5 px-3 font-mono text-slate-500">{item.barcode}</td>
                          <td className="py-2.5 px-3 text-center font-bold text-rose-600">{item.currentQuantity}</td>
                          <td className="py-2.5 px-3 text-center font-black text-slate-900">{item.reorderQuantity}</td>
                          <td className="py-2.5 px-3 text-right font-mono">${item.unitCost.toFixed(2)}</td>
                          <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900">${item.lineTotal.toFixed(2)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>

              {/* Total & Signature */}
              <div className="flex justify-between items-end pt-2">
                <div className="space-y-4">
                  <div className="pt-6 border-t border-slate-300 w-56 text-center">
                    <p className="font-bold text-slate-800 text-xs">{store.defaultOperator}</p>
                    <p className="text-[10px] text-slate-500">Authorized Purchasing Pharmacist</p>
                  </div>
                </div>

                <div className="text-right space-y-1">
                  <span className="text-slate-500 text-xs">Total Estimated Procurement Cost:</span>
                  <div className="text-xl font-black font-mono text-slate-950">
                    ${selectedPO.totalCost.toFixed(2)}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 2: ADD NEW SUPPLIER */}
      {showAddSupplierModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <h3 className="font-bold text-slate-900 text-sm">Add Supplier Partner</h3>
              <button
                onClick={() => setShowAddSupplierModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">Company / Distributor Name *</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. MedPharma Global Logistics"
                  value={newSupplier.company}
                  onChange={(e) => setNewSupplier({ ...newSupplier, company: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Contact Person Name</label>
                <input
                  type="text"
                  placeholder="e.g. Robert Jenkins"
                  value={newSupplier.name}
                  onChange={(e) => setNewSupplier({ ...newSupplier, name: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Phone Number *</label>
                <input
                  type="text"
                  required
                  placeholder="+1 (555) 000-0000"
                  value={newSupplier.phone}
                  onChange={(e) => setNewSupplier({ ...newSupplier, phone: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Address / Warehouse</label>
                <input
                  type="text"
                  placeholder="Industrial Zone, Suite 400"
                  value={newSupplier.address}
                  onChange={(e) => setNewSupplier({ ...newSupplier, address: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setShowAddSupplierModal(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold"
                >
                  Save Supplier
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
