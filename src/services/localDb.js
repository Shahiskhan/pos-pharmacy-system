/**
 * Local IndexedDB Storage Engine for Desktop Pharmacy POS
 * Zero-configuration local database that runs directly inside the browser/Electron renderer.
 * Collections: medicines, sales, suppliers, customers, metadata
 */
import { storeConfig as defaultStoreConfig } from '../config/storeConfig';

const DB_NAME = 'PharmacyPOS_LocalDB';
const DB_VERSION = 3;

export const STORES = {
  MEDICINES: 'medicines',
  SALES: 'sales',
  SUPPLIERS: 'suppliers',
  CUSTOMERS: 'customers',
  META: 'metadata',
};

export async function getStoreConfig() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.META, 'readonly');
    const request = tx.objectStore(STORES.META).get('storeConfig');

    request.onsuccess = () => resolve({
      ...defaultStoreConfig,
      ...(request.result?.value || {}),
    });
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function saveStoreConfig(config) {
  const db = await openDatabase();
  const nextConfig = {
    ...defaultStoreConfig,
    appName: String(config.appName || '').trim(),
    licenseNumber: String(config.licenseNumber || '').trim(),
  };
  if (!nextConfig.appName) {
    throw new Error('Store name is required.');
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.META, 'readwrite');
    tx.objectStore(STORES.META).put({ key: 'storeConfig', value: nextConfig });
    tx.oncomplete = () => {
      notifyDatabaseChange();
      resolve(nextConfig);
    };
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Saving store configuration was aborted.'));
  });
}

// Default pre-populated suppliers
const SEED_SUPPLIERS = [
  {
    id: 'sup-001',
    name: 'Robert Jenkins',
    phone: '+1 (555) 349-1102',
    company: 'MedPharma Global Distributors',
    address: '450 Industrial Parkway, Chicago, IL',
  },
  {
    id: 'sup-002',
    name: 'Maria Santos',
    phone: '+1 (555) 882-9901',
    company: 'Apex Healthcare Logistics',
    address: '1200 Logistics Blvd, Dallas, TX',
  },
  {
    id: 'sup-003',
    name: 'David Kim',
    phone: '+1 (555) 704-5512',
    company: 'Nova Pharmaceutical Labs',
    address: '88 Tech Ridge Way, Atlanta, GA',
  },
];

// Open and upgrade IndexedDB database connection
function openDatabase() {
  return new Promise((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
      reject(new Error('IndexedDB is not supported in this environment.'));
      return;
    }

    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      // 1. Medicines Store
      if (!db.objectStoreNames.contains(STORES.MEDICINES)) {
        const medicineStore = db.createObjectStore(STORES.MEDICINES, { keyPath: 'id' });
        medicineStore.createIndex('barcode', 'barcode', { unique: false });
        medicineStore.createIndex('productName', 'productName', { unique: false });
        medicineStore.createIndex('category', 'category', { unique: false });
        medicineStore.createIndex('batchNo', 'batchNo', { unique: false });
      }

      // 2. Sales Store
      if (!db.objectStoreNames.contains(STORES.SALES)) {
        const salesStore = db.createObjectStore(STORES.SALES, { keyPath: 'id' });
        salesStore.createIndex('invoiceNo', 'invoiceNo', { unique: true });
        salesStore.createIndex('timestamp', 'timestamp', { unique: false });
      }

      // 3. Suppliers Store
      if (!db.objectStoreNames.contains(STORES.SUPPLIERS)) {
        const suppliersStore = db.createObjectStore(STORES.SUPPLIERS, { keyPath: 'id' });
        suppliersStore.createIndex('company', 'company', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.CUSTOMERS)) {
        const customerStore = db.createObjectStore(STORES.CUSTOMERS, { keyPath: 'id' });
        customerStore.createIndex('phone', 'phone', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORES.META)) {
        db.createObjectStore(STORES.META, { keyPath: 'key' });
      }
    };

    request.onsuccess = (event) => {
      const db = event.target.result;
      seedDefaultData(db).then(() => resolve(db)).catch((error) => {
        db.close();
        reject(error);
      });
    };

    request.onerror = (event) => {
      reject(event.target.error || new Error('Failed to open IndexedDB'));
    };
  });
}

// Seed once only when the complete user database is empty.
async function seedDefaultData(db) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORES.MEDICINES, STORES.SALES, STORES.SUPPLIERS, STORES.META],
      'readwrite'
    );
    const medicineStore = tx.objectStore(STORES.MEDICINES);
    const salesStore = tx.objectStore(STORES.SALES);
    const supplierStore = tx.objectStore(STORES.SUPPLIERS);
    const metaStore = tx.objectStore(STORES.META);
    const counts = {};
    let initialized;
    let pending = 4;

    const maybeInitialize = () => {
      pending -= 1;
      if (pending !== 0) return;

      if (!initialized && counts.medicines === 0 && counts.sales === 0 && counts.suppliers === 0) {
        SEED_SUPPLIERS.forEach((sup) => supplierStore.add(sup));
      }
      if (!initialized) metaStore.put({ key: 'initialized', value: true });
    };

    medicineStore.count().onsuccess = (event) => {
      counts.medicines = event.target.result;
      maybeInitialize();
    };
    salesStore.count().onsuccess = (event) => {
      counts.sales = event.target.result;
      maybeInitialize();
    };
    supplierStore.count().onsuccess = (event) => {
      counts.suppliers = event.target.result;
      maybeInitialize();
    };
    metaStore.get('initialized').onsuccess = (event) => {
      initialized = Boolean(event.target.result);
      maybeInitialize();
    };

    tx.oncomplete = () => resolve();
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Database initialization was aborted.'));
  });
}

function notifyDatabaseChange() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new Event('pharmacydbchange'));
  }
}

// --- MEDICINES API ---

export async function getMedicines() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MEDICINES, 'readonly');
    const store = tx.objectStore(STORES.MEDICINES);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getMedicineByBarcode(barcode) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MEDICINES, 'readonly');
    const store = tx.objectStore(STORES.MEDICINES);
    const index = store.index('barcode');
    const request = index.get(barcode);

    request.onsuccess = () => resolve(request.result || null);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function searchMedicines(query) {
  const all = await getMedicines();
  if (!query || !query.trim()) return all;

  const q = query.toLowerCase().trim();
  return all.filter((med) => {
    return (
      (med.productName && String(med.productName).toLowerCase().includes(q)) ||
      (med.saltName && String(med.saltName).toLowerCase().includes(q)) ||
      (med.barcode && String(med.barcode).toLowerCase().includes(q)) ||
      (med.batchNo && String(med.batchNo).toLowerCase().includes(q)) ||
      (med.category && String(med.category).toLowerCase().includes(q))
    );
  });
}

export async function addMedicine(medicineData) {
  const db = await openDatabase();
  const id = medicineData.id || `med-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
  const record = { ...medicineData, id };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MEDICINES, 'readwrite');
    const store = tx.objectStore(STORES.MEDICINES);
    const request = store.add(record);

    request.onsuccess = () => {};
    request.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => {
      notifyDatabaseChange();
      resolve(record);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function bulkAddMedicines(medicineList) {
  return bulkUpsertMedicines(medicineList);
}

/**
 * Bulk upserts medicines into local IndexedDB:
 * - If exact Barcode + BatchNo already exists, aggregates quantity and updates prices.
 * - Otherwise creates a new medicine record.
 * - Supports real-time progress callbacks: onProgress(processed, total, percent)
 */
export async function bulkUpsertMedicines(medicineList, onProgress = null) {
  const db = await openDatabase();
  const allExisting = await getMedicines();

  // Create lookup map based on barcode + batchNo
  const lookupMap = new Map();
  allExisting.forEach((med) => {
    const key = `${(med.barcode || '').trim().toLowerCase()}|${(med.batchNo || '').trim().toLowerCase()}`;
    if (key !== '|') {
      lookupMap.set(key, { ...med });
    }
  });

  const recordsToCommit = [];
  let insertedCount = 0;
  let updatedCount = 0;
  const failedRows = [];

  medicineList.forEach((med, idx) => {
    const barcode = String(med.barcode || '').trim();
    const batchNo = String(med.batchNo || '').trim();
    const key = `${barcode.toLowerCase()}|${batchNo.toLowerCase()}`;

    // Validate essential fields
    if (!med.productName || !barcode || !batchNo || Number(med.sellingPrice) <= 0 || Number(med.quantity) <= 0) {
      failedRows.push({
        row: idx + 1,
        item: med.productName || 'Unknown',
        reason: 'Missing critical field or non-positive quantity/price',
      });
      return;
    }

    if (lookupMap.has(key)) {
      // Upsert: Add incoming stock to existing stock and update price
      const existing = lookupMap.get(key);
      const updatedRecord = {
        ...existing,
        productName: med.productName || existing.productName,
        saltName: med.saltName || existing.saltName,
        quantity: Math.max(0, (Number(existing.quantity) || 0) + (Number(med.quantity) || 0)),
        purchasePrice: Number(med.purchasePrice) > 0 ? Number(med.purchasePrice) : existing.purchasePrice,
        sellingPrice: Number(med.sellingPrice) > 0 ? Number(med.sellingPrice) : existing.sellingPrice,
        expiryDate: med.expiryDate || existing.expiryDate,
        category: med.category || existing.category,
      };

      lookupMap.set(key, updatedRecord);
      recordsToCommit.push({ record: updatedRecord, type: 'updated' });
      updatedCount++;
    } else {
      // New record
      const id = med.id || `med-${Date.now()}-${idx}-${Math.random().toString(36).substr(2, 5)}`;
      const newRecord = {
        ...med,
        id,
        barcode,
        batchNo,
        productName: String(med.productName).trim(),
        saltName: String(med.saltName || '').trim(),
        quantity: Math.max(0, Number(med.quantity) || 0),
        purchasePrice: Math.max(0, Number(med.purchasePrice) || 0),
        sellingPrice: Math.max(0, Number(med.sellingPrice) || 0),
        expiryDate: String(med.expiryDate || '').trim(),
        category: String(med.category || 'General').trim(),
      };

      lookupMap.set(key, newRecord);
      recordsToCommit.push({ record: newRecord, type: 'inserted' });
      insertedCount++;
    }
  });

  // Batch commit to IndexedDB
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MEDICINES, 'readwrite');
    const store = tx.objectStore(STORES.MEDICINES);
    const total = recordsToCommit.length;

    recordsToCommit.forEach((item, index) => {
      store.put(item.record);
      if (onProgress && (index % 10 === 0 || index === total - 1)) {
        const percent = total > 0 ? Math.round(((index + 1) / total) * 100) : 100;
        onProgress(index + 1, total, percent);
      }
    });

    tx.oncomplete = () => {
      notifyDatabaseChange();
      if (onProgress) onProgress(total, total, 100);
      resolve({
        totalCommitted: recordsToCommit.length,
        insertedCount,
        updatedCount,
        failedCount: failedRows.length,
        failedRows,
      });
    };

    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function updateMedicine(id, updates) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MEDICINES, 'readwrite');
    const store = tx.objectStore(STORES.MEDICINES);
    const getReq = store.get(id);
    let updatedRecord;

    getReq.onsuccess = () => {
      const existing = getReq.result;
      if (!existing) {
        reject(new Error(`Medicine with id ${id} not found.`));
        return;
      }

      updatedRecord = { ...existing, ...updates, id };
      const putReq = store.put(updatedRecord);
      putReq.onerror = (e) => reject(e.target.error);
    };

    getReq.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => {
      notifyDatabaseChange();
      if (updatedRecord) resolve(updatedRecord);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

export async function deleteMedicine(id) {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.MEDICINES, 'readwrite');
    const store = tx.objectStore(STORES.MEDICINES);
    const request = store.delete(id);

    request.onsuccess = () => {};
    request.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => {
      notifyDatabaseChange();
      resolve(true);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- SALES API ---

/**
 * Generates formatted invoice number: INV-YYYY-MMDD-XXX
 */
function generateInvoiceNumber(salesCountToday = 0) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const seq = String(salesCountToday + 1).padStart(3, '0');
  return `INV-${year}-${month}${day}-${seq}`;
}

export async function recordSale({
  invoiceNo,
  items, // array of { id, productName, saltName, batchNo, sellingPrice, quantity, subtotal }
  subtotal,
  discount = 0,
  tax = 0,
  grandTotal,
  paymentMode = 'Cash', // 'Cash' | 'Card' | 'Insurance'
  cashTendered = 0,
  changeReturned = 0,
  cashierName = defaultStoreConfig.defaultOperator,
  customerName = 'Walk-in Customer',
  customerPhone = '',
}) {
  const db = await openDatabase();
  const timestamp = new Date().toISOString();
  const id = `sale-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

  // Determine today's sequential count if invoiceNo not provided
  let inv = invoiceNo;
  if (!inv) {
    const existingSales = await getSales();
    const todayStr = new Date().toISOString().split('T')[0];
    const todaySales = existingSales.filter(s => s.timestamp && s.timestamp.startsWith(todayStr));
    inv = generateInvoiceNumber(todaySales.length);
  }

  const saleRecord = {
    id,
    invoiceNo: inv,
    items: items.map(item => ({
      ...item,
      returnedQuantity: 0,
    })),
    subtotal: Number(Number(subtotal).toFixed(2)),
    discount: Number(Number(discount).toFixed(2)),
    tax: Number(Number(tax).toFixed(2)),
    grandTotal: Number(Number(grandTotal).toFixed(2)),
    refundTotal: 0,
    netTotal: Number(Number(grandTotal).toFixed(2)),
    status: 'Completed', // 'Completed' | 'Partially Refunded' | 'Fully Refunded'
    paymentMode,
    cashTendered: Number(Number(cashTendered).toFixed(2)),
    changeReturned: Number(Number(changeReturned).toFixed(2)),
    cashierName,
    customerName: customerName || 'Walk-in Customer',
    customerPhone: String(customerPhone || '').trim(),
    timestamp,
    returns: [],
  };

  return new Promise((resolve, reject) => {
    if (paymentMode === 'Credit / Udhaar' && (!saleRecord.customerName.trim() || !saleRecord.customerPhone.trim())) {
      reject(new Error('Customer name and phone number are required for credit sales.'));
      return;
    }
    if (paymentMode === 'Credit / Udhaar' && normalizeCustomerPhone(saleRecord.customerPhone).length < 4) {
      reject(new Error('Enter a valid customer phone number for credit sales.'));
      return;
    }
    if (items.some((item) => !item.id)) {
      reject(new Error('Every cart item must reference an inventory batch.'));
      return;
    }

    const storeNames = [STORES.SALES, STORES.MEDICINES];
    if (paymentMode === 'Credit / Udhaar') storeNames.push(STORES.CUSTOMERS);
    const tx = db.transaction(storeNames, 'readwrite');
    const salesStore = tx.objectStore(STORES.SALES);
    const medicineStore = tx.objectStore(STORES.MEDICINES);
    const customerStore = paymentMode === 'Credit / Udhaar'
      ? tx.objectStore(STORES.CUSTOMERS)
      : null;

    salesStore.add(saleRecord);

    // Sale, inventory deduction, and any customer credit are committed together.
    let inventoryValidationError = null;
    items.forEach((item) => {
      const getReq = medicineStore.get(item.id);
      getReq.onsuccess = () => {
        if (inventoryValidationError) return;
        const med = getReq.result;
        if (!med) {
          inventoryValidationError = `Medicine batch ${item.batchNo || item.id} is no longer in inventory.`;
          tx.abort();
          return;
        }
        if (isMedicineExpired(med.expiryDate)) {
          inventoryValidationError = `${med.productName} batch ${med.batchNo || ''} is expired and cannot be sold.`;
          tx.abort();
          return;
        }
        const availableQuantity = Number(med.quantity) || 0;
        if (availableQuantity < Number(item.quantity || 0)) {
          inventoryValidationError = `Insufficient stock for ${med.productName} batch ${med.batchNo || ''}.`;
          tx.abort();
          return;
        }
        med.quantity = availableQuantity - (Number(item.quantity) || 0);
        medicineStore.put(med);
      };
    });

    if (customerStore) {
      const phoneKey = normalizeCustomerPhone(saleRecord.customerPhone);
      const allCustomersRequest = customerStore.getAll();
      allCustomersRequest.onsuccess = () => {
        const existingCustomer = allCustomersRequest.result.find(
          (customer) => normalizeCustomerPhone(customer.phone) === phoneKey
        );
        const customer = existingCustomer || {
          id: `customer-${phoneKey}`,
          name: saleRecord.customerName.trim(),
          phone: saleRecord.customerPhone,
          totalCredit: 0,
          totalPaid: 0,
          balance: 0,
          ledger: [],
        };
        customer.name = saleRecord.customerName.trim();
        customer.phone = saleRecord.customerPhone;
        customer.totalCredit = Number(((Number(customer.totalCredit) || 0) + saleRecord.grandTotal).toFixed(2));
        customer.balance = Number(((Number(customer.balance) || 0) + saleRecord.grandTotal).toFixed(2));
        customer.ledger = Array.isArray(customer.ledger) ? customer.ledger : [];
        customer.ledger.push({
          id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
          type: 'credit',
          amount: saleRecord.grandTotal,
          saleId: saleRecord.id,
          invoiceNo: saleRecord.invoiceNo,
          timestamp,
          note: 'Credit sale',
        });
        saleRecord.customerId = customer.id;
        salesStore.put(saleRecord);
        customerStore.put(customer);
      };
    }

    tx.oncomplete = () => {
      notifyDatabaseChange();
      resolve(saleRecord);
    };
    tx.onerror = (e) => reject(inventoryValidationError || e.target.error);
    tx.onabort = (e) => reject(inventoryValidationError || e.target.error || new Error('Sale transaction was aborted.'));
  });
}

function isMedicineExpired(expiryDate) {
  if (!expiryDate) return false;
  const expiry = new Date(`${expiryDate}T00:00:00`);
  if (Number.isNaN(expiry.getTime())) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return expiry < today;
}

function normalizeCustomerPhone(phone) {
  return String(phone || '').replace(/\D/g, '');
}

export async function getSales() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SALES, 'readonly');
    const store = tx.objectStore(STORES.SALES);
    const request = store.getAll();

    request.onsuccess = () => {
      // Sort newest sales first
      const results = (request.result || []).sort(
        (a, b) => new Date(b.timestamp) - new Date(a.timestamp)
      );
      resolve(results);
    };
    request.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Atomic Stock Restoration & Refund Processing
 * - Adds returned quantities back to respective medicine batches in `medicines` store.
 * - Updates the sale invoice with returned quantities, refundTotal, netTotal, and status.
 * - Records a logged return entry with timestamp and return reason.
 */
export async function processReturn({
  saleId,
  returnedItems, // array of { id, productName, batchNo, returnQuantity, unitPrice, lineRefund }
  refundAmount,
  reason = 'Customer Return',
  cashierName = defaultStoreConfig.defaultOperator,
}) {
  const db = await openDatabase();
  const timestamp = new Date().toISOString();
  const returnId = `ret-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

  return new Promise((resolve, reject) => {
    const transactionStores = [STORES.SALES, STORES.MEDICINES];
    if (saleId && returnedItems && returnedItems.length) {
      transactionStores.push(STORES.CUSTOMERS);
    }
    const tx = db.transaction(transactionStores, 'readwrite');
    const salesStore = tx.objectStore(STORES.SALES);
    const medicineStore = tx.objectStore(STORES.MEDICINES);
    const customerStore = transactionStores.includes(STORES.CUSTOMERS)
      ? tx.objectStore(STORES.CUSTOMERS)
      : null;

    const getSaleReq = salesStore.get(saleId);
    getSaleReq.onsuccess = () => {
      const sale = getSaleReq.result;
      if (!sale) {
        reject(new Error(`Sale invoice with id ${saleId} not found.`));
        return;
      }

      // 1. Restock returned quantities into medicines store
      returnedItems.forEach((retItem) => {
        if (retItem.id && Number(retItem.returnQuantity) > 0) {
          const getMedReq = medicineStore.get(retItem.id);
          getMedReq.onsuccess = () => {
            const med = getMedReq.result;
            if (med) {
              med.quantity = (Number(med.quantity) || 0) + Number(retItem.returnQuantity);
              medicineStore.put(med);
            }
          };
        }

        // Update returned quantity inside the sale's items list
        const origItem = sale.items.find(
          (i) => i.id === retItem.id || (i.productName === retItem.productName && i.batchNo === retItem.batchNo)
        );
        if (origItem) {
          origItem.returnedQuantity = (Number(origItem.returnedQuantity) || 0) + Number(retItem.returnQuantity);
        }
      });

      // 2. Update sale record refund totals and status
      const totalRefund = Number(Number(refundAmount).toFixed(2));
      sale.refundTotal = Number(((Number(sale.refundTotal) || 0) + totalRefund).toFixed(2));
      sale.netTotal = Math.max(0, Number(((Number(sale.grandTotal) || 0) - sale.refundTotal).toFixed(2)));

      // Check if all items are fully returned
      const totalSoldUnits = sale.items.reduce((sum, i) => sum + Number(i.quantity || 1), 0);
      const totalReturnedUnits = sale.items.reduce((sum, i) => sum + Number(i.returnedQuantity || 0), 0);

      if (totalReturnedUnits >= totalSoldUnits) {
        sale.status = 'Fully Refunded';
      } else {
        sale.status = 'Partially Refunded';
      }

      // Log return entry history in the sale
      if (!sale.returns) sale.returns = [];
      const returnEntry = {
        returnId,
        timestamp,
        items: returnedItems,
        refundAmount: totalRefund,
        reason,
        cashierName,
      };
      sale.returns.push(returnEntry);

      if (customerStore && sale.paymentMode === 'Credit / Udhaar' && sale.customerId) {
        const customerRequest = customerStore.get(sale.customerId);
        customerRequest.onsuccess = () => {
          const customer = customerRequest.result;
          if (!customer) return;
          const balance = Number(customer.balance) || 0;
          const accountCredit = Math.min(balance, totalRefund);
          customer.balance = Number((balance - accountCredit).toFixed(2));
          customer.ledger = Array.isArray(customer.ledger) ? customer.ledger : [];
          customer.ledger.push({
            id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
            type: 'credit-return',
            amount: accountCredit,
            saleId: sale.id,
            invoiceNo: sale.invoiceNo,
            timestamp,
            note: 'Credit sale return adjustment',
          });
          customerStore.put(customer);
        };
      }

      salesStore.put(sale);
    };

    tx.oncomplete = () => {
      notifyDatabaseChange();
      // Re-fetch updated sale to return
      const readTx = db.transaction(STORES.SALES, 'readonly');
      const req = readTx.objectStore(STORES.SALES).get(saleId);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(true);
    };

    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- SUPPLIERS API ---

export async function getSuppliers() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SUPPLIERS, 'readonly');
    const store = tx.objectStore(STORES.SUPPLIERS);
    const request = store.getAll();

    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (e) => reject(e.target.error);
  });
}

export async function getCustomers() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CUSTOMERS, 'readonly');
    const request = tx.objectStore(STORES.CUSTOMERS).getAll();
    request.onsuccess = () => resolve((request.result || []).sort((a, b) => String(a.name || '').localeCompare(String(b.name || ''))));
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function getDatabaseMetadata() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.META, 'readonly');
    const request = tx.objectStore(STORES.META).getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = (event) => reject(event.target.error);
  });
}

export async function recordCustomerPayment(customerId, amount, note = '') {
  const paymentAmount = Number(amount);
  if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
    throw new Error('Payment amount must be greater than zero.');
  }

  const db = await openDatabase();
  const timestamp = new Date().toISOString();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.CUSTOMERS, 'readwrite');
    const store = tx.objectStore(STORES.CUSTOMERS);
    const request = store.get(customerId);
    let updatedCustomer;

    request.onsuccess = () => {
      const customer = request.result;
      if (!customer) {
        tx.abort();
        reject(new Error('Customer record was not found.'));
        return;
      }
      const balance = Number(customer.balance) || 0;
      if (paymentAmount > balance) {
        tx.abort();
        reject(new Error(`Payment cannot exceed the outstanding balance of ${balance.toFixed(2)}.`));
        return;
      }

      customer.totalPaid = Number(((Number(customer.totalPaid) || 0) + paymentAmount).toFixed(2));
      customer.balance = Number((balance - paymentAmount).toFixed(2));
      customer.ledger = Array.isArray(customer.ledger) ? customer.ledger : [];
      customer.ledger.push({
        id: `ledger-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        type: 'payment',
        amount: paymentAmount,
        timestamp,
        note: String(note || '').trim() || 'Customer repayment',
      });
      updatedCustomer = customer;
      store.put(customer);
    };

    tx.oncomplete = () => {
      notifyDatabaseChange();
      resolve(updatedCustomer);
    };
    tx.onerror = (event) => reject(event.target.error);
    tx.onabort = (event) => reject(event.target.error || new Error('Recording customer payment was aborted.'));
  });
}

export async function addSupplier(supplierData) {
  const db = await openDatabase();
  const id = supplierData.id || `sup-${Date.now()}`;
  const record = { ...supplierData, id };

  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORES.SUPPLIERS, 'readwrite');
    const store = tx.objectStore(STORES.SUPPLIERS);
    const request = store.add(record);

    request.onsuccess = () => {};
    request.onerror = (e) => reject(e.target.error);
    tx.oncomplete = () => {
      notifyDatabaseChange();
      resolve(record);
    };
    tx.onerror = (e) => reject(e.target.error);
  });
}

// --- DATABASE UTILITIES & FACTORY RESET ---

/**
 * Clears all user-data object stores while preserving the initialization marker.
 */
export async function clearAllData() {
  const db = await openDatabase();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(
      [STORES.MEDICINES, STORES.SALES, STORES.SUPPLIERS, STORES.CUSTOMERS, STORES.META],
      'readwrite'
    );
    const medStore = tx.objectStore(STORES.MEDICINES);
    const salesStore = tx.objectStore(STORES.SALES);
    const supStore = tx.objectStore(STORES.SUPPLIERS);
    const customerStore = tx.objectStore(STORES.CUSTOMERS);
    const metaStore = tx.objectStore(STORES.META);

    medStore.clear();
    salesStore.clear();
    supStore.clear();
    customerStore.clear();
    metaStore.put({ key: 'initialized', value: true });

    tx.oncomplete = () => {
      notifyDatabaseChange();
      resolve({
        success: true,
        timestamp: new Date().toISOString(),
      });
    };

    tx.onerror = (e) => reject(e.target.error);
  });
}

/**
 * Exports full IndexedDB collections into a JSON backup object
 */
export async function exportDatabaseBackup() {
  const [medicines, sales, suppliers, customers, config, metadata] = await Promise.all([
    getMedicines(),
    getSales(),
    getSuppliers(),
    getCustomers(),
    getStoreConfig(),
    getDatabaseMetadata(),
  ]);

  return {
    appName: config.appName,
    version: '1.0.0',
    exportedAt: new Date().toISOString(),
    storeConfig: config,
    metadataStore: metadata,
    collections: {
      medicines,
      sales,
      suppliers,
      customers,
    },
    metadata: {
      totalMedicines: medicines.length,
      totalSales: sales.length,
      totalSuppliers: suppliers.length,
      totalCustomers: customers.length,
    },
  };
}

export async function resetDatabase() {
  return new Promise((resolve, reject) => {
    const req = window.indexedDB.deleteDatabase(DB_NAME);
    req.onsuccess = () => resolve(true);
    req.onerror = (e) => reject(e.target.error);
    req.onblocked = () => resolve(true);
  });
}
