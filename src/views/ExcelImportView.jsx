import React, { useState } from 'react';
import * as XLSX from 'xlsx';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  Download,
  AlertCircle,
  FileCheck,
  Trash2,
  Database,
  Loader2,
  Check,
  X,
  RefreshCw,
  ArrowRight,
  TrendingUp,
} from 'lucide-react';
import { bulkUpsertMedicines } from '../services/localDb';

// Required columns and their common spelling aliases in Excel sheets
const REQUIRED_COLUMNS = [
  { key: 'Barcode', aliases: ['barcode', 'code', 'upc', 'ean', 'bar_code'] },
  { key: 'ProductName', aliases: ['productname', 'product_name', 'name', 'medicine', 'itemname', 'item_name'] },
  { key: 'SaltName', aliases: ['saltname', 'salt_name', 'salt', 'generic', 'genericname', 'generic_name'] },
  { key: 'BatchNo', aliases: ['batchno', 'batch_no', 'batch', 'lot', 'lotnumber', 'lot_no'] },
  { key: 'Quantity', aliases: ['quantity', 'qty', 'stock', 'units', 'initial_stock', 'count'] },
  { key: 'PurchasePrice', aliases: ['purchaseprice', 'purchase_price', 'cost', 'costprice', 'cost_price', 'buyprice'] },
  { key: 'SellingPrice', aliases: ['sellingprice', 'selling_price', 'price', 'retailprice', 'retail_price', 'mrp'] },
  { key: 'ExpiryDate', aliases: ['expirydate', 'expiry_date', 'expiry', 'exp_date', 'expdate', 'expiration'] },
  { key: 'Category', aliases: ['category', 'type', 'group', 'classification'] },
];

/**
 * Normalizes different date formats into ISO YYYY-MM-DD string
 * Handles: Excel serial numbers (e.g. 45678), Date objects, YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY
 */
function parseAndFormatDate(value) {
  if (!value) return null;

  // Handle Excel serial date numbers
  if (typeof value === 'number' && value > 10000 && value < 60000) {
    try {
      const dateObj = new Date(Math.round((value - 25569) * 86400 * 1000));
      if (!isNaN(dateObj.getTime())) {
        return dateObj.toISOString().split('T')[0];
      }
    } catch (_) {}
  }

  // Handle JS Date object
  if (value instanceof Date && !isNaN(value.getTime())) {
    return value.toISOString().split('T')[0];
  }

  const str = String(value).trim();
  if (!str) return null;

  // Check if string matches YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(str)) {
    const d = new Date(str);
    return !isNaN(d.getTime()) ? str : null;
  }

  // Check if string matches DD/MM/YYYY or DD-MM-YYYY
  const partsDmy = str.match(/^(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{4})$/);
  if (partsDmy) {
    const day = parseInt(partsDmy[1], 10);
    const month = parseInt(partsDmy[2], 10);
    const year = parseInt(partsDmy[3], 10);
    const d = new Date(year, month - 1, day);
    if (!isNaN(d.getTime())) {
      const mm = String(month).padStart(2, '0');
      const dd = String(day).padStart(2, '0');
      return `${year}-${mm}-${dd}`;
    }
  }

  // Fallback to standard Date.parse
  const parsed = new Date(str);
  if (!isNaN(parsed.getTime()) && parsed.getFullYear() > 2000 && parsed.getFullYear() < 2100) {
    return parsed.toISOString().split('T')[0];
  }

  return null;
}

export default function ExcelImportView({ onNavigate }) {
  const [dragOver, setDragOver] = useState(false);
  const [file, setFile] = useState(null);
  const [parsing, setParsing] = useState(false);
  const [previewLimit, setPreviewLimit] = useState(15);
  const [filterMode, setFilterMode] = useState('all'); // 'all' | 'valid' | 'invalid'

  // Parsed and validated datasets
  const [parsedRows, setParsedRows] = useState([]);
  const [validRecords, setValidRecords] = useState([]);
  const [invalidRecords, setInvalidRecords] = useState([]);
  const [columnMappingErrors, setColumnMappingErrors] = useState([]);
  const [detectedHeaders, setDetectedHeaders] = useState([]);

  // Commit Phase States
  const [committing, setCommitting] = useState(false);
  const [commitProgress, setCommitProgress] = useState(0); // 0 to 100
  const [commitResult, setCommitResult] = useState(null); // stores summary stats modal data

  // 1. Generate & Download Sample Template
  const handleDownloadSample = () => {
    const sampleRows = [
      {
        Barcode: '8901234567801',
        ProductName: 'Ciprofloxacin 500mg',
        SaltName: 'Ciprofloxacin HCl',
        BatchNo: 'CPX-401',
        Quantity: 60,
        PurchasePrice: 8.50,
        SellingPrice: 12.00,
        ExpiryDate: '2028-05-30',
        Category: 'Antibiotics',
      },
      {
        Barcode: '8901234567802',
        ProductName: 'Omeprazole 20mg',
        SaltName: 'Omeprazole Base',
        BatchNo: 'OMP-109',
        Quantity: 100,
        PurchasePrice: 5.20,
        SellingPrice: 8.90,
        ExpiryDate: '2027-10-15',
        Category: 'Antacids',
      },
      {
        Barcode: '8901234567803',
        ProductName: 'Azithromycin 500mg',
        SaltName: 'Azithromycin Dihydrate',
        BatchNo: 'AZM-882',
        Quantity: 40,
        PurchasePrice: 11.00,
        SellingPrice: 16.50,
        ExpiryDate: '2027-12-31',
        Category: 'Antibiotics',
      },
      {
        Barcode: '8901234567804',
        ProductName: 'Metformin 500mg',
        SaltName: 'Metformin Hydrochloride',
        BatchNo: 'MTF-201',
        Quantity: 150,
        PurchasePrice: 3.40,
        SellingPrice: 5.80,
        ExpiryDate: '2028-08-20',
        Category: 'Antidiabetic',
      },
      {
        Barcode: '8901234567890',
        ProductName: 'Augmentin 625mg',
        SaltName: 'Amoxicillin + Clavulanate',
        BatchNo: 'B7021',
        Quantity: 50,
        PurchasePrice: 10.50,
        SellingPrice: 14.50,
        ExpiryDate: '2027-11-30',
        Category: 'Antibiotics',
      },
    ];

    const worksheet = XLSX.utils.json_to_sheet(sampleRows);
    worksheet['!cols'] = [
      { wch: 16 }, // Barcode
      { wch: 24 }, // ProductName
      { wch: 24 }, // SaltName
      { wch: 12 }, // BatchNo
      { wch: 10 }, // Quantity
      { wch: 14 }, // PurchasePrice
      { wch: 14 }, // SellingPrice
      { wch: 14 }, // ExpiryDate
      { wch: 16 }, // Category
    ];

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Medicines_Catalog');
    XLSX.writeFile(workbook, 'Pharmacy_Medicines_Sample_Template.xlsx');
  };

  // 2. Parse & Validate Excel Rows
  const processUploadedFile = (uploadedFile) => {
    if (!uploadedFile) return;

    setFile(uploadedFile);
    setParsing(true);
    setCommitResult(null);

    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const buffer = e.target.result;
        const workbook = XLSX.read(buffer, { type: 'array', cellDates: true });
        const sheetName = workbook.SheetNames[0];

        if (!sheetName) throw new Error('Spreadsheet has no sheets.');

        const worksheet = workbook.Sheets[sheetName];
        const rawRows = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

        if (rawRows.length === 0) throw new Error('Spreadsheet appears to be completely empty.');

        const headers = Object.keys(rawRows[0] || {});
        setDetectedHeaders(headers);

        // Map column headers
        const columnMap = {};
        const missingRequired = [];

        REQUIRED_COLUMNS.forEach((colDef) => {
          const match = headers.find((h) => {
            const normalized = h.toLowerCase().replace(/[^a-z0-9]/g, '');
            return (
              normalized === colDef.key.toLowerCase() ||
              colDef.aliases.includes(normalized)
            );
          });

          if (match) {
            columnMap[colDef.key] = match;
          } else {
            // Essential headers that must be mapped
            if (['ProductName', 'Barcode', 'BatchNo', 'SellingPrice', 'Quantity'].includes(colDef.key)) {
              missingRequired.push(colDef.key);
            }
          }
        });

        setColumnMappingErrors(missingRequired);

        // Robust Row-by-Row Validation Engine
        const validList = [];
        const invalidList = [];

        const processed = rawRows.map((row, index) => {
          const barcode = row[columnMap.Barcode] ? String(row[columnMap.Barcode]).trim() : '';
          const productName = row[columnMap.ProductName] ? String(row[columnMap.ProductName]).trim() : '';
          const saltName = row[columnMap.SaltName] ? String(row[columnMap.SaltName]).trim() : '';
          const batchNo = row[columnMap.BatchNo] ? String(row[columnMap.BatchNo]).trim() : '';
          const rawQuantity = row[columnMap.Quantity];
          const rawPurchase = row[columnMap.PurchasePrice];
          const rawSelling = row[columnMap.SellingPrice];
          const rawExpiry = row[columnMap.ExpiryDate];
          const category = row[columnMap.Category] ? String(row[columnMap.Category]).trim() : 'General';

          const quantity = Number(rawQuantity);
          const purchasePrice = Number(rawPurchase) || 0;
          const sellingPrice = Number(rawSelling);
          const formattedExpiry = parseAndFormatDate(rawExpiry);

          // Collect specific error reasons
          const errors = [];
          if (!productName) errors.push('ProductName is missing');
          if (!barcode) errors.push('Barcode is empty');
          if (!batchNo) errors.push('BatchNo is empty');
          if (isNaN(quantity) || quantity <= 0) errors.push('Quantity must be > 0');
          if (isNaN(sellingPrice) || sellingPrice <= 0) errors.push('SellingPrice must be > 0');
          if (!formattedExpiry) errors.push('Invalid ExpiryDate (expected YYYY-MM-DD or DD/MM/YYYY)');

          const isValid = errors.length === 0;

          const record = {
            _rowNumber: index + 2,
            productName,
            saltName,
            barcode,
            batchNo,
            quantity: isNaN(quantity) ? 0 : quantity,
            purchasePrice: isNaN(purchasePrice) ? 0 : purchasePrice,
            sellingPrice: isNaN(sellingPrice) ? 0 : sellingPrice,
            expiryDate: formattedExpiry || String(rawExpiry || ''),
            category: category || 'General',
            _isValid: isValid,
            _errors: errors,
          };

          if (isValid) {
            validList.push(record);
          } else {
            invalidList.push(record);
          }

          return record;
        });

        setParsedRows(processed);
        setValidRecords(validList);
        setInvalidRecords(invalidList);
      } catch (err) {
        console.error('Failed to parse spreadsheet:', err);
        alert(`Failed to parse file: ${err.message}`);
        setFile(null);
      } finally {
        setParsing(false);
      }
    };

    reader.onerror = () => {
      alert('File reading encountered an error.');
      setParsing(false);
      setFile(null);
    };

    reader.readAsArrayBuffer(uploadedFile);
  };

  // Drag and Drop listeners
  const handleDragOver = (e) => {
    e.preventDefault();
    setDragOver(true);
  };

  const handleDragLeave = () => {
    setDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files && e.target.files[0]) {
      processUploadedFile(e.target.files[0]);
    }
  };

  const handleClear = () => {
    setFile(null);
    setParsedRows([]);
    setValidRecords([]);
    setInvalidRecords([]);
    setColumnMappingErrors([]);
    setCommitResult(null);
    setCommitProgress(0);
  };

  // 3. Batch commit valid records with live progress
  const handleBatchCommit = async () => {
    if (validRecords.length === 0 || committing) return;

    setCommitting(true);
    setCommitProgress(5);

    try {
      // Simulate stepped progress during computation if items are few, or live callback
      const onProgress = (processed, total, percent) => {
        setCommitProgress(percent);
      };

      // Upsert logic inside localDb.js
      const result = await bulkUpsertMedicines(validRecords, onProgress);

      setCommitResult({
        ...result,
        fileTotal: parsedRows.length,
        timestamp: new Date().toLocaleTimeString(),
      });
    } catch (err) {
      console.error('Batch commit failed:', err);
      alert(`Batch commit failed: ${err.message}`);
    } finally {
      setCommitting(false);
    }
  };

  // Filtered rows for the preview table
  const displayedRows = parsedRows
    .filter((row) => {
      if (filterMode === 'valid') return row._isValid;
      if (filterMode === 'invalid') return !row._isValid;
      return true;
    })
    .slice(0, previewLimit);

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Header & Download Template Action Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-bold text-slate-800 flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5 text-emerald-600" />
            Bulk Excel Data Validation & Upsert Engine
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Import hundreds of catalog items with schema verification, duplicate batch detection, and stock aggregation.
          </p>
        </div>

        <button
          onClick={handleDownloadSample}
          className="flex items-center gap-2 px-4 py-2 rounded-xl bg-emerald-50 hover:bg-emerald-100/80 text-emerald-800 border border-emerald-200 text-xs font-semibold shadow-sm transition active:scale-95 flex-shrink-0"
        >
          <Download className="h-4 w-4 text-emerald-700" />
          Download Sample Excel Template (.xlsx)
        </button>
      </div>

      {/* File Upload Zone */}
      {!file ? (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-2xl p-10 flex flex-col items-center justify-center text-center transition-all duration-200 bg-white ${
            dragOver
              ? 'border-emerald-500 bg-emerald-50/50 scale-[1.01]'
              : 'border-slate-300 hover:border-emerald-400 hover:bg-slate-50/50 shadow-sm'
          }`}
        >
          <div className="p-4 rounded-2xl bg-emerald-100 text-emerald-700 mb-3 shadow-inner">
            <UploadCloud className="h-10 w-10 animate-bounce" />
          </div>

          <h3 className="text-sm font-bold text-slate-800">
            Drag & drop your Excel (.xlsx, .xls) or CSV spreadsheet here
          </h3>
          <p className="text-xs text-slate-400 mt-1 max-w-md">
            Validates Barcode, ProductName, BatchNo, positive Quantity & SellingPrice, and ExpiryDate before database insertion.
          </p>

          <label className="mt-5 cursor-pointer inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-md transition active:scale-95">
            <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
            <span>Select File to Validate</span>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              onChange={handleFileChange}
              className="hidden"
            />
          </label>
        </div>
      ) : (
        /* File Active Summary Bar */
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-700">
              <FileCheck className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-bold text-slate-800 text-sm">{file.name}</span>
                <span className="text-[11px] font-mono text-slate-400">
                  ({(file.size / 1024).toFixed(1)} KB)
                </span>
              </div>
              <p className="text-xs text-slate-500">
                {parsing
                  ? 'Parsing and verifying rows...'
                  : `${parsedRows.length} total rows parsed • ${validRecords.length} valid for insertion`}
              </p>
            </div>
          </div>

          <button
            onClick={handleClear}
            disabled={committing}
            className="p-2 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition"
            title="Clear and upload new file"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Parsing Spinner */}
      {parsing && (
        <div className="bg-white rounded-xl border border-slate-200 p-8 shadow-sm flex items-center justify-center gap-3 text-slate-600 text-sm">
          <Loader2 className="h-5 w-5 animate-spin text-emerald-600" />
          <span>Executing row validation rules and schema mapping...</span>
        </div>
      )}

      {/* Analytics Card & Pre-Commit Validation Summary */}
      {parsedRows.length > 0 && !parsing && (
        <div className="space-y-6">
          {/* Summary Metric Counters */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Total Rows Detected
              </span>
              <div className="text-2xl font-black text-slate-900 mt-1">
                {parsedRows.length}
              </div>
              <span className="text-[11px] text-slate-500 mt-0.5 block">
                Worksheet row count
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Valid for Insertion
              </span>
              <div className="text-2xl font-black text-emerald-600 mt-1">
                {validRecords.length}
              </div>
              <span className="text-[11px] text-emerald-700 font-medium mt-0.5 block">
                Passed all validation criteria
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Failed Validation
              </span>
              <div className="text-2xl font-black text-rose-600 mt-1">
                {invalidRecords.length}
              </div>
              <span className="text-[11px] text-rose-600 font-medium mt-0.5 block">
                {invalidRecords.length > 0 ? 'Will be skipped' : 'Zero validation errors'}
              </span>
            </div>

            <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-sm">
              <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wide">
                Schema Mapping
              </span>
              <div className="mt-1 flex items-center gap-1.5">
                {columnMappingErrors.length === 0 ? (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    All Columns Mapped
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-xs font-bold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Missing: {columnMappingErrors.join(', ')}
                  </span>
                )}
              </div>
              <span className="text-[11px] text-slate-500 mt-1 block truncate">
                {detectedHeaders.length} headers parsed
              </span>
            </div>
          </div>

          {/* Missing Column Warnings */}
          {columnMappingErrors.length > 0 && (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-3">
              <AlertCircle className="h-5 w-5 text-rose-600 flex-shrink-0 mt-0.5" />
              <div>
                <h4 className="font-bold">Missing Required Column(s)</h4>
                <p className="mt-0.5 text-rose-700">
                  The spreadsheet is missing critical headers:{' '}
                  <strong className="underline">{columnMappingErrors.join(', ')}</strong>. Rows lacking these attributes will fail validation.
                </p>
              </div>
            </div>
          )}

          {/* Real-Time Database Commit Progress Bar */}
          {committing && (
            <div className="bg-white rounded-xl border border-emerald-200 p-5 shadow-sm space-y-3">
              <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
                <span className="flex items-center gap-2">
                  <Loader2 className="h-4 w-4 animate-spin text-emerald-600" />
                  Upserting valid medicines into Local IndexedDB...
                </span>
                <span className="font-mono text-emerald-700">{commitProgress}%</span>
              </div>
              <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden border border-slate-200">
                <div
                  className="bg-emerald-600 h-full rounded-full transition-all duration-300 ease-out"
                  style={{ width: `${commitProgress}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-500">
                Detecting duplicate Barcode + BatchNo to add quantities into existing stock.
              </p>
            </div>
          )}

          {/* Preview Data Table */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex flex-col lg:flex-row lg:items-center justify-between gap-3 bg-slate-50/70">
              <div className="flex flex-wrap items-center gap-3">
                <h3 className="font-bold text-slate-800 text-sm">
                  Parsed Data Preview
                </h3>

                {/* Filter Pills */}
                <div className="flex items-center bg-white rounded-lg border border-slate-200 p-0.5 text-xs">
                  <button
                    onClick={() => setFilterMode('all')}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      filterMode === 'all'
                        ? 'bg-slate-800 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    All ({parsedRows.length})
                  </button>
                  <button
                    onClick={() => setFilterMode('valid')}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      filterMode === 'valid'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-emerald-700 hover:bg-emerald-50'
                    }`}
                  >
                    Valid ({validRecords.length})
                  </button>
                  <button
                    onClick={() => setFilterMode('invalid')}
                    className={`px-2.5 py-1 rounded-md font-medium transition ${
                      filterMode === 'invalid'
                        ? 'bg-rose-600 text-white shadow-xs'
                        : 'text-rose-600 hover:bg-rose-50'
                    }`}
                  >
                    Invalid ({invalidRecords.length})
                  </button>
                </div>
              </div>

              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5 text-xs text-slate-500">
                  <span>Show rows:</span>
                  <select
                    value={previewLimit}
                    onChange={(e) => setPreviewLimit(Number(e.target.value))}
                    className="border border-slate-200 rounded-lg px-2 py-1 bg-white text-slate-700 font-semibold focus:outline-none"
                  >
                    <option value={10}>10</option>
                    <option value={15}>15</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>

                <button
                  onClick={handleBatchCommit}
                  disabled={validRecords.length === 0 || committing}
                  className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 disabled:bg-slate-300 text-white font-bold text-xs shadow-md transition flex items-center gap-2 active:scale-95"
                >
                  <Database className="h-4 w-4" />
                  Commit {validRecords.length} Valid Rows to LocalDB
                </button>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="bg-slate-50 text-slate-500 uppercase font-semibold tracking-wider border-b border-slate-200">
                    <th className="py-2.5 px-3 text-center">Row</th>
                    <th className="py-2.5 px-3">Product Name</th>
                    <th className="py-2.5 px-3">Generic Salt</th>
                    <th className="py-2.5 px-3">Barcode</th>
                    <th className="py-2.5 px-3">Batch #</th>
                    <th className="py-2.5 px-3 text-center">Qty</th>
                    <th className="py-2.5 px-3 text-right">Purchase Price</th>
                    <th className="py-2.5 px-3 text-right">Selling Price</th>
                    <th className="py-2.5 px-3">Expiry Date</th>
                    <th className="py-2.5 px-3">Category</th>
                    <th className="py-2.5 px-3 text-center">Validation Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {displayedRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={`hover:bg-slate-50 transition ${
                        !row._isValid ? 'bg-rose-50/30' : ''
                      }`}
                    >
                      <td className="py-2.5 px-3 text-center font-mono text-slate-400">
                        {row._rowNumber}
                      </td>
                      <td className="py-2.5 px-3 font-bold text-slate-800">
                        {row.productName || (
                          <span className="text-rose-500 italic">Empty Name</span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        {row.saltName || '—'}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-500">
                        {row.barcode || <span className="text-rose-500 italic">Missing</span>}
                      </td>
                      <td className="py-2.5 px-3 font-mono text-slate-700">
                        {row.batchNo || <span className="text-rose-500 italic">Missing</span>}
                      </td>
                      <td className="py-2.5 px-3 text-center font-bold">
                        <span className={row.quantity <= 0 ? 'text-rose-600' : 'text-slate-800'}>
                          {row.quantity}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-right text-slate-500">
                        ${Number(row.purchasePrice).toFixed(2)}
                      </td>
                      <td className="py-2.5 px-3 text-right font-bold text-slate-900">
                        <span className={row.sellingPrice <= 0 ? 'text-rose-600' : ''}>
                          ${Number(row.sellingPrice).toFixed(2)}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        {row.expiryDate || <span className="text-rose-500">Invalid</span>}
                      </td>
                      <td className="py-2.5 px-3 text-slate-600">
                        <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 text-[10px]">
                          {row.category}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {row._isValid ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <CheckCircle2 className="h-3 w-3" />
                            Valid
                          </span>
                        ) : (
                          <div className="flex flex-col items-center">
                            <span
                              className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200 cursor-help"
                              title={row._errors.join(', ')}
                            >
                              <AlertCircle className="h-3 w-3" />
                              {row._errors[0]}
                            </span>
                            {row._errors.length > 1 && (
                              <span className="text-[9px] text-rose-500 mt-0.5">
                                +{row._errors.length - 1} more errors
                              </span>
                            )}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* Success & Summary Statistics Modal */}
      {commitResult && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
          <div className="w-full max-w-lg bg-white rounded-2xl border border-slate-200 shadow-2xl p-6 space-y-5">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                <div className="p-3 rounded-2xl bg-emerald-100 text-emerald-700">
                  <CheckCircle2 className="h-8 w-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-slate-900">
                    Database Upsert Complete!
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Batch processed and persisted in IndexedDB at {commitResult.timestamp}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setCommitResult(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            {/* Statistics Grid */}
            <div className="grid grid-cols-3 gap-3 text-center">
              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="text-[10px] font-semibold text-slate-400 uppercase tracking-wider block">
                  Total Committed
                </span>
                <span className="text-xl font-black text-slate-900 mt-1 block">
                  {commitResult.totalCommitted}
                </span>
              </div>

              <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                <span className="text-[10px] font-semibold text-emerald-700 uppercase tracking-wider block">
                  New Batches Added
                </span>
                <span className="text-xl font-black text-emerald-600 mt-1 block">
                  {commitResult.insertedCount}
                </span>
              </div>

              <div className="bg-teal-50 p-3 rounded-xl border border-teal-200">
                <span className="text-[10px] font-semibold text-teal-700 uppercase tracking-wider block">
                  Existing Batches Updated
                </span>
                <span className="text-xl font-black text-teal-600 mt-1 block">
                  {commitResult.updatedCount}
                </span>
              </div>
            </div>

            <p className="text-xs text-slate-600 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
              Existing medicines with identical <strong>Barcode + Batch #</strong> had their stock quantities aggregated and prices updated automatically without creating duplicate entries.
            </p>

            {/* Action Buttons */}
            <div className="flex flex-col sm:flex-row items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                onClick={() => {
                  setCommitResult(null);
                  handleClear();
                }}
                className="w-full sm:w-auto px-4 py-2 rounded-xl border border-slate-200 text-slate-700 text-xs font-semibold hover:bg-slate-50 transition"
              >
                Import Another File
              </button>

              {onNavigate && (
                <>
                  <button
                    onClick={() => {
                      setCommitResult(null);
                      onNavigate('inventory');
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition"
                  >
                    View in Inventory
                  </button>
                  <button
                    onClick={() => {
                      setCommitResult(null);
                      onNavigate('billing');
                    }}
                    className="w-full sm:w-auto px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition flex items-center justify-center gap-1.5"
                  >
                    Open POS Counter <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
