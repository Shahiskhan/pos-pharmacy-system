import React, { useState, useEffect, useMemo } from 'react';
import {
  Search,
  Plus,
  AlertTriangle,
  AlertCircle,
  CheckCircle,
  Clock,
  Edit2,
  Trash2,
  Loader2,
  X,
  Package,
  Layers,
  Calendar,
  DollarSign,
  Barcode as BarcodeIcon,
  Check,
} from 'lucide-react';
import MASTER_MEDICINE_CATALOG from '../utils/masterCatalog';
import {
  getMedicines,
  addMedicine,
  updateMedicine,
  deleteMedicine,
} from '../services/localDb';

/**
 * Calculates remaining days until expiry date
 * Returns { daysRemaining, isExpired, isExpiringSoon }
 */
function getExpiryStatus(expiryDateStr) {
  if (!expiryDateStr) {
    return { daysRemaining: 999, isExpired: false, isExpiringSoon: false };
  }

  const expiry = new Date(expiryDateStr);
  if (isNaN(expiry.getTime())) {
    return { daysRemaining: 999, isExpired: false, isExpiringSoon: false };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const diffTime = expiry.getTime() - today.getTime();
  const daysRemaining = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

  return {
    daysRemaining,
    isExpired: daysRemaining < 0,
    isExpiringSoon: daysRemaining >= 0 && daysRemaining <= 90,
  };
}

export default function InventoryView() {
  const [medicines, setMedicines] = useState([]);
  const [loading, setLoading] = useState(true);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [activeFilterTab, setActiveFilterTab] = useState('all'); // 'all' | 'critical' | 'low' | 'expiring' | 'expired'
  const [selectedCategory, setSelectedCategory] = useState('all');

  // Modals state
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingMedicine, setEditingMedicine] = useState(null);
  const [deletingMedicine, setDeletingMedicine] = useState(null);

  // Success Notification Toast
  const [toastMessage, setToastMessage] = useState(null);

  // Form State for Add / Edit
  const initialFormState = {
    productName: '',
    saltName: '',
    barcode: '',
    batchNo: '',
    quantity: '',
    purchasePrice: '',
    sellingPrice: '',
    expiryDate: '',
    category: 'General',
  };
  const [formData, setFormData] = useState(initialFormState);
  const [shortcutQuery, setShortcutQuery] = useState('');

  // Load medicines from local IndexedDB
  const loadInventory = async () => {
    try {
      const data = await getMedicines();
      setMedicines(data);
    } catch (err) {
      console.error('Failed to load inventory from localDb:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadInventory();
  }, []);

  const triggerToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Distinct Categories
  const categories = useMemo(() => {
    const set = new Set(medicines.map((m) => m.category || 'General'));
    return ['all', ...Array.from(set)];
  }, [medicines]);

  // Real-Time Multi-Criteria Search & Filter Engine
  const filteredMedicines = useMemo(() => {
    return medicines.filter((item) => {
      const q = searchQuery.toLowerCase().trim();

      // Multi-criteria text match (Product Name, Salt Name, Barcode, Batch #)
      const matchesSearch =
        !q ||
        (item.productName && item.productName.toLowerCase().includes(q)) ||
        (item.saltName && item.saltName.toLowerCase().includes(q)) ||
        (item.barcode && item.barcode.includes(q)) ||
        (item.batchNo && item.batchNo.toLowerCase().includes(q));

      // Category filter
      const matchesCategory =
        selectedCategory === 'all' ||
        (item.category || 'General').toLowerCase() === selectedCategory.toLowerCase();

      // Quick filter tabs
      const qty = Number(item.quantity || 0);
      const { isExpired, isExpiringSoon } = getExpiryStatus(item.expiryDate);

      let matchesTab = true;
      if (activeFilterTab === 'critical') matchesTab = qty <= 5;
      else if (activeFilterTab === 'low') matchesTab = qty > 5 && qty <= 15;
      else if (activeFilterTab === 'expiring') matchesTab = isExpiringSoon;
      else if (activeFilterTab === 'expired') matchesTab = isExpired;

      return matchesSearch && matchesCategory && matchesTab;
    });
  }, [medicines, searchQuery, selectedCategory, activeFilterTab]);

  // Overall inventory counts for filter chips
  const counts = useMemo(() => {
    let critical = 0;
    let low = 0;
    let expiring = 0;
    let expired = 0;

    medicines.forEach((m) => {
      const qty = Number(m.quantity || 0);
      const { isExpired, isExpiringSoon } = getExpiryStatus(m.expiryDate);

      if (qty <= 5) critical++;
      else if (qty <= 15) low++;

      if (isExpired) expired++;
      else if (isExpiringSoon) expiring++;
    });

    return { critical, low, expiring, expired, total: medicines.length };
  }, [medicines]);

  // --- ADD MEDICINE ACTION ---
  const handleOpenAdd = () => {
    setFormData(initialFormState);
    setShortcutQuery('');
    setShowAddModal(true);
  };

  const handleShortcutChange = (value) => {
    setShortcutQuery(value);
    const matchedMedicine = MASTER_MEDICINE_CATALOG.find(
      (medicine) => medicine.productName.toLowerCase() === value.trim().toLowerCase()
    );

    if (matchedMedicine) {
      setFormData((current) => ({
        ...current,
        productName: matchedMedicine.productName,
        saltName: matchedMedicine.saltName,
        category: matchedMedicine.category,
      }));
    } else {
      setFormData((current) => ({
        ...current,
        productName: value,
        saltName: '',
        category: 'General',
      }));
    }
  };

  const handleAddSubmit = async (e) => {
    e.preventDefault();
    if (
      !formData.productName.trim() ||
      !formData.barcode.trim() ||
      !formData.batchNo.trim() ||
      !formData.quantity ||
      Number(formData.quantity) <= 0 ||
      formData.purchasePrice === '' ||
      Number(formData.purchasePrice) < 0 ||
      !formData.sellingPrice ||
      Number(formData.sellingPrice) <= 0 ||
      !formData.expiryDate
    ) {
      alert('Please fill in all required fields.');
      return;
    }

    try {
      await addMedicine({
        ...formData,
        productName: formData.productName.trim(),
        saltName: formData.saltName.trim(),
        barcode: formData.barcode.trim(),
        batchNo: formData.batchNo.trim(),
        quantity: Number(formData.quantity),
        purchasePrice: Number(formData.purchasePrice),
        sellingPrice: Number(formData.sellingPrice),
      });

      setShowAddModal(false);
      triggerToast(`Added "${formData.productName}" to inventory.`);
      await loadInventory();
    } catch (err) {
      alert(`Failed to save medicine: ${err.message}`);
    }
  };

  // --- EDIT MEDICINE ACTION ---
  const handleOpenEdit = (medicine) => {
    setEditingMedicine(medicine);
    setFormData({
      productName: medicine.productName || '',
      saltName: medicine.saltName || '',
      barcode: medicine.barcode || '',
      batchNo: medicine.batchNo || '',
      quantity: medicine.quantity ?? 0,
      purchasePrice: medicine.purchasePrice ?? '',
      sellingPrice: medicine.sellingPrice ?? '',
      expiryDate: medicine.expiryDate || '',
      category: medicine.category || 'General',
    });
  };

  const handleEditSubmit = async (e) => {
    e.preventDefault();
    if (!editingMedicine) return;

    try {
      await updateMedicine(editingMedicine.id, {
        productName: formData.productName,
        saltName: formData.saltName,
        barcode: formData.barcode,
        batchNo: formData.batchNo,
        quantity: Math.max(0, Number(formData.quantity) || 0),
        purchasePrice: Math.max(0, Number(formData.purchasePrice) || 0),
        sellingPrice: Math.max(0, Number(formData.sellingPrice) || 0),
        expiryDate: formData.expiryDate,
        category: formData.category,
      });

      setEditingMedicine(null);
      triggerToast(`Updated "${formData.productName}" successfully.`);
      await loadInventory();
    } catch (err) {
      alert(`Failed to update medicine: ${err.message}`);
    }
  };

  // --- DELETE MEDICINE ACTION ---
  const handleConfirmDelete = async () => {
    if (!deletingMedicine) return;
    try {
      await deleteMedicine(deletingMedicine.id);
      triggerToast(`Deleted batch "${deletingMedicine.batchNo}" of ${deletingMedicine.productName}.`);
      setDeletingMedicine(null);
      await loadInventory();
    } catch (err) {
      alert(`Failed to delete medicine: ${err.message}`);
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Notification Banner */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-slate-900 text-white text-xs font-semibold shadow-xl border border-slate-700 animate-in slide-in-from-bottom-3 duration-200">
          <CheckCircle className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Top Header & Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
              <Package className="h-5 w-5 text-emerald-600" />
              Pharmacy Stock & Batch Management
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Live inventory tracking with automated expiry risk detection and critical reorder thresholds.
            </p>
          </div>

          <button
            onClick={handleOpenAdd}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md shadow-emerald-700/20 transition active:scale-95 flex-shrink-0"
          >
            <Plus className="h-4 w-4" />
            Add New Medicine Manually
          </button>
        </div>

        {/* Search Bar & Fast Filters */}
        <div className="flex flex-col md:flex-row md:items-center gap-3 pt-2 border-t border-slate-100">
          {/* Multi-criteria search input */}
          <div className="relative flex-1">
            <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by Product Name, Salt/Generic Name, Barcode, or Batch #..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition"
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Category Dropdown */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 font-medium">Category:</span>
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-500/20 text-slate-700 font-semibold"
            >
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat === 'all' ? 'All Categories' : cat}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Filter Pills for Quick Diagnosis */}
        <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-semibold">
          <button
            onClick={() => setActiveFilterTab('all')}
            className={`px-3 py-1.5 rounded-lg border transition ${
              activeFilterTab === 'all'
                ? 'bg-slate-900 text-white border-slate-900'
                : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
            }`}
          >
            All Stock ({counts.total})
          </button>

          <button
            onClick={() => setActiveFilterTab('critical')}
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
              activeFilterTab === 'critical'
                ? 'bg-rose-600 text-white border-rose-600'
                : 'bg-rose-50 text-rose-700 border-rose-200 hover:bg-rose-100/70'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Critical Stock (&le; 5) ({counts.critical})
          </button>

          <button
            onClick={() => setActiveFilterTab('low')}
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
              activeFilterTab === 'low'
                ? 'bg-amber-500 text-white border-amber-600'
                : 'bg-amber-50 text-amber-800 border-amber-200 hover:bg-amber-100/70'
            }`}
          >
            <AlertTriangle className="h-3.5 w-3.5" />
            Low Stock (6–15) ({counts.low})
          </button>

          <button
            onClick={() => setActiveFilterTab('expiring')}
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
              activeFilterTab === 'expiring'
                ? 'bg-orange-500 text-white border-orange-600'
                : 'bg-orange-50 text-orange-800 border-orange-200 hover:bg-orange-100/70'
            }`}
          >
            <Clock className="h-3.5 w-3.5" />
            Expiring &le; 90 Days ({counts.expiring})
          </button>

          <button
            onClick={() => setActiveFilterTab('expired')}
            className={`px-3 py-1.5 rounded-lg border flex items-center gap-1.5 transition ${
              activeFilterTab === 'expired'
                ? 'bg-red-800 text-white border-red-900'
                : 'bg-red-50 text-red-900 border-red-200 hover:bg-red-100/70'
            }`}
          >
            <AlertCircle className="h-3.5 w-3.5" />
            Expired ({counts.expired})
          </button>
        </div>
      </div>

      {/* Main Stock Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-12 flex items-center justify-center text-slate-400 text-xs gap-2">
            <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
            Loading live medicine inventory from local database...
          </div>
        ) : filteredMedicines.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <Package className="h-10 w-10 text-slate-300 mx-auto stroke-1" />
            <p className="font-semibold text-slate-600">No matching medicines found.</p>
            <p className="text-[11px] text-slate-400">
              Try adjusting your search terms, changing the category, or resetting the filter pill.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead>
                <tr className="bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200">
                  <th className="py-3 px-4">Product Name & Salt</th>
                  <th className="py-3 px-4">Barcode / EAN</th>
                  <th className="py-3 px-4">Batch #</th>
                  <th className="py-3 px-4 text-center">Quantity</th>
                  <th className="py-3 px-4 text-right">Purchase Price</th>
                  <th className="py-3 px-4 text-right">Selling Price</th>
                  <th className="py-3 px-4">Expiry Date</th>
                  <th className="py-3 px-4">Category</th>
                  <th className="py-3 px-4 text-center">Status</th>
                  <th className="py-3 px-4 text-center">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredMedicines.map((item) => {
                  const qty = Number(item.quantity || 0);
                  const isCritical = qty <= 5;
                  const isLow = qty > 5 && qty <= 15;

                  const { daysRemaining, isExpired, isExpiringSoon } = getExpiryStatus(item.expiryDate);

                  return (
                    <tr
                      key={item.id}
                      className={`hover:bg-slate-50/80 transition ${
                        isExpired
                          ? 'bg-rose-50/40'
                          : isCritical
                          ? 'bg-amber-50/20'
                          : ''
                      }`}
                    >
                      {/* Product Name & Salt */}
                      <td className="py-3 px-4">
                        <div className="font-bold text-slate-900 text-xs">
                          {item.productName}
                        </div>
                        <div className="text-[11px] text-slate-500 font-medium line-clamp-1">
                          {item.saltName || 'Generic formula not specified'}
                        </div>
                      </td>

                      {/* Barcode */}
                      <td className="py-3 px-4 font-mono text-slate-600">
                        <span className="bg-slate-100 px-2 py-0.5 rounded text-[11px]">
                          {item.barcode}
                        </span>
                      </td>

                      {/* Batch Number */}
                      <td className="py-3 px-4 font-mono font-semibold text-slate-800">
                        {item.batchNo}
                      </td>

                      {/* Quantity & Stock Badge */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex flex-col items-center">
                          <span
                            className={`text-sm font-extrabold ${
                              isCritical
                                ? 'text-rose-600'
                                : isLow
                                ? 'text-amber-600'
                                : 'text-slate-800'
                            }`}
                          >
                            {qty}
                          </span>
                          {isCritical ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mt-0.5">
                              <AlertCircle className="h-2.5 w-2.5" />
                              &le; 5 Critical
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center gap-1 text-[9px] font-bold text-amber-700 bg-amber-50 px-1.5 py-0.5 rounded border border-amber-200 mt-0.5">
                              <AlertTriangle className="h-2.5 w-2.5" />
                              Low Stock
                            </span>
                          ) : (
                            <span className="inline-flex items-center text-[9px] font-semibold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded border border-emerald-200 mt-0.5">
                              In Stock
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Purchase Price */}
                      <td className="py-3 px-4 text-right text-slate-500 font-medium">
                        ${Number(item.purchasePrice || 0).toFixed(2)}
                      </td>

                      {/* Selling Price */}
                      <td className="py-3 px-4 text-right font-bold text-slate-900">
                        ${Number(item.sellingPrice || 0).toFixed(2)}
                      </td>

                      {/* Expiry Date & Expiry Badge */}
                      <td className="py-3 px-4">
                        <div className="font-mono text-xs text-slate-700">
                          {item.expiryDate || '—'}
                        </div>
                        {isExpired ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-extrabold text-rose-700 bg-rose-50 px-1.5 py-0.5 rounded border border-rose-200 mt-0.5">
                            <AlertCircle className="h-3 w-3 text-rose-600" />
                            Expired ({Math.abs(daysRemaining)}d ago)
                          </span>
                        ) : isExpiringSoon ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-bold text-orange-700 bg-orange-50 px-1.5 py-0.5 rounded border border-orange-200 mt-0.5">
                            <Clock className="h-3 w-3 text-orange-600" />
                            Expires in {daysRemaining} days
                          </span>
                        ) : null}
                      </td>

                      {/* Category */}
                      <td className="py-3 px-4">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-[10px] font-semibold">
                          {item.category || 'General'}
                        </span>
                      </td>

                      {/* Status Summary */}
                      <td className="py-3 px-4 text-center">
                        {isExpired ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-rose-100 text-rose-800 text-[10px] font-bold">
                            Do Not Dispense
                          </span>
                        ) : isCritical ? (
                          <span className="inline-block px-2 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                            Reorder Now
                          </span>
                        ) : (
                          <span className="inline-block px-2 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                            Active
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => handleOpenEdit(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-emerald-700 hover:border-emerald-300 hover:bg-emerald-50 transition"
                            title="Edit Medicine"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => setDeletingMedicine(item)}
                            className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-600 hover:text-rose-600 hover:border-rose-300 hover:bg-rose-50 transition"
                            title="Delete Batch"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
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

      {/* MODAL 1: ADD NEW MEDICINE MANUALLY */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-white rounded-2xl border border-slate-200 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Plus className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Add New Medicine to Stock</h3>
                  <p className="text-[11px] text-slate-500">Persists directly into local IndexedDB</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddSubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label htmlFor="medicine-shortcut" className="block font-semibold text-slate-700 mb-1">
                  Select from Common Shortcuts (or type custom)
                </label>
                <input
                  id="medicine-shortcut"
                  type="search"
                  list="master-medicine-shortcuts"
                  autoComplete="off"
                  placeholder="Search common medicine names..."
                  value={shortcutQuery}
                  onChange={(e) => handleShortcutChange(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-emerald-200 bg-emerald-50/40 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
                <datalist id="master-medicine-shortcuts">
                  {MASTER_MEDICINE_CATALOG.map((medicine) => (
                    <option key={medicine.productName} value={medicine.productName}>
                      {medicine.saltName}
                    </option>
                  ))}
                </datalist>
                <p className="mt-1 text-[10px] text-slate-500">
                  Choosing a shortcut fills the product, generic salt, and category. Batch details remain yours to enter.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Product Name & Dosage *
                </label>
                <input
                  type="text"
                  required
                  placeholder="e.g. Augmentin 625mg, Panadol Extra"
                  value={formData.productName}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Generic Salt Name
                </label>
                <input
                  type="text"
                  placeholder="e.g. Amoxicillin + Clavulanic Acid"
                  value={formData.saltName}
                  onChange={(e) => setFormData({ ...formData, saltName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Barcode / EAN *</label>
                  <input
                    type="text"
                    required
                    placeholder="8901234567890"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Batch Number *</label>
                  <input
                    type="text"
                    required
                    placeholder="B7021"
                    value={formData.batchNo}
                    onChange={(e) => setFormData({ ...formData, batchNo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Initial Quantity *</label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Purchase Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    min="0"
                    required
                    placeholder="0.00"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selling Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    placeholder="0.00"
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="Antibiotics">Antibiotics</option>
                    <option value="Analgesics">Analgesics</option>
                    <option value="Antacids">Antacids</option>
                    <option value="Cardiovascular">Cardiovascular</option>
                    <option value="Respiratory">Respiratory</option>
                    <option value="Anti-inflammatory">Anti-inflammatory</option>
                    <option value="Antidiabetic">Antidiabetic</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-700/20"
                >
                  Save New Medicine
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: EDIT MEDICINE */}
      {editingMedicine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-xl bg-white rounded-2xl border border-slate-200 shadow-2xl p-6">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="p-2 rounded-xl bg-emerald-100 text-emerald-700">
                  <Edit2 className="h-5 w-5" />
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-sm">Edit Medicine Details</h3>
                  <p className="text-[11px] text-slate-500 font-mono">ID: {editingMedicine.id}</p>
                </div>
              </div>
              <button
                onClick={() => setEditingMedicine(null)}
                className="p-1 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleEditSubmit} className="mt-4 space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Product Name & Dosage *
                </label>
                <input
                  type="text"
                  required
                  value={formData.productName}
                  onChange={(e) => setFormData({ ...formData, productName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Generic Salt Name
                </label>
                <input
                  type="text"
                  value={formData.saltName}
                  onChange={(e) => setFormData({ ...formData, saltName: e.target.value })}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Barcode / EAN *</label>
                  <input
                    type="text"
                    required
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Batch Number *</label>
                  <input
                    type="text"
                    required
                    value={formData.batchNo}
                    onChange={(e) => setFormData({ ...formData, batchNo: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stock Quantity *</label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={formData.quantity}
                    onChange={(e) => setFormData({ ...formData, quantity: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Purchase Price ($)</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.purchasePrice}
                    onChange={(e) => setFormData({ ...formData, purchasePrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Selling Price ($) *</label>
                  <input
                    type="number"
                    step="0.01"
                    required
                    value={formData.sellingPrice}
                    onChange={(e) => setFormData({ ...formData, sellingPrice: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 font-bold text-emerald-700"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Expiry Date *</label>
                  <input
                    type="date"
                    required
                    value={formData.expiryDate}
                    onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                    className="w-full px-3 py-2 rounded-lg border border-slate-200 focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="Antibiotics">Antibiotics</option>
                    <option value="Analgesics">Analgesics</option>
                    <option value="Antacids">Antacids</option>
                    <option value="Cardiovascular">Cardiovascular</option>
                    <option value="Respiratory">Respiratory</option>
                    <option value="Anti-inflammatory">Anti-inflammatory</option>
                    <option value="Antidiabetic">Antidiabetic</option>
                    <option value="General">General</option>
                  </select>
                </div>
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingMedicine(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold shadow-md shadow-emerald-700/20"
                >
                  Apply Changes
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: DELETE CONFIRMATION DIALOG */}
      {deletingMedicine && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-md bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="p-3 rounded-2xl bg-rose-100 text-rose-700 flex-shrink-0">
                <AlertCircle className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-bold text-slate-900 text-sm">
                  Delete Medicine Batch?
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Are you sure you want to remove this batch from local inventory? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
              <div>
                <span className="text-slate-400">Product: </span>
                <strong className="text-slate-800">{deletingMedicine.productName}</strong>
              </div>
              <div>
                <span className="text-slate-400">Batch Number: </span>
                <span className="font-mono text-slate-800 font-semibold">{deletingMedicine.batchNo}</span>
              </div>
              <div>
                <span className="text-slate-400">Current Stock: </span>
                <span className="font-bold text-slate-800">{deletingMedicine.quantity} units</span>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setDeletingMedicine(null)}
                className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-50 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold shadow-md shadow-rose-700/20"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
