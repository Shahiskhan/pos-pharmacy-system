import React, { useCallback, useEffect, useState } from 'react';
import { ContactRound, RefreshCw, CircleDollarSign, History } from 'lucide-react';
import { getCustomers, recordCustomerPayment } from '../services/localDb';

export default function CustomerLedgerView() {
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [paymentCustomer, setPaymentCustomer] = useState(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');
  const [savingPayment, setSavingPayment] = useState(false);
  const [toast, setToast] = useState('');

  const loadCustomers = useCallback(async () => {
    try {
      setCustomers(await getCustomers());
      setError('');
    } catch (loadError) {
      console.error('Failed to load customer ledgers:', loadError);
      setError(`Unable to load customer ledgers: ${loadError.message}`);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCustomers();
    window.addEventListener('pharmacydbchange', loadCustomers);
    return () => window.removeEventListener('pharmacydbchange', loadCustomers);
  }, [loadCustomers]);

  const savePayment = async (event) => {
    event.preventDefault();
    if (!paymentCustomer || savingPayment) return;
    setSavingPayment(true);
    setError('');
    try {
      await recordCustomerPayment(paymentCustomer.id, paymentAmount, paymentNote);
      setPaymentCustomer(null);
      setPaymentAmount('');
      setPaymentNote('');
      setToast('Customer repayment recorded.');
      window.setTimeout(() => setToast(''), 3500);
    } catch (paymentError) {
      console.error('Failed to record customer repayment:', paymentError);
      setError(paymentError.message);
    } finally {
      setSavingPayment(false);
    }
  };

  const totalOutstanding = customers.reduce((total, customer) => total + (Number(customer.balance) || 0), 0);

  return (
    <section className="max-w-6xl mx-auto space-y-5 pb-10">
      {toast && <div role="status" className="fixed top-20 right-6 z-40 rounded-lg bg-emerald-700 px-4 py-3 text-sm font-semibold text-white shadow-lg">{toast}</div>}
      <header className="flex items-center justify-between rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
        <div>
          <h2 className="flex items-center gap-2 text-base font-bold text-slate-800"><ContactRound className="h-5 w-5 text-emerald-600" />Customer Credit Ledger</h2>
          <p className="mt-1 text-xs text-slate-500">Track outstanding credit and record customer repayments.</p>
        </div>
        <button type="button" onClick={loadCustomers} className="flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
          <RefreshCw className="h-3.5 w-3.5" /> Refresh
        </button>
      </header>

      <div className="rounded-xl border border-amber-200 bg-amber-50 p-4">
        <span className="text-xs font-semibold uppercase tracking-wide text-amber-800">Total outstanding credit</span>
        <p className="mt-1 font-mono text-2xl font-black text-amber-950">${totalOutstanding.toFixed(2)}</p>
      </div>

      {error && <div role="alert" className="rounded-lg border border-rose-200 bg-rose-50 p-3 text-sm text-rose-800">{error}</div>}
      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        {loading ? <p className="p-6 text-center text-sm text-slate-500">Loading ledgers...</p> : customers.length === 0 ? (
          <div className="p-10 text-center text-sm text-slate-500">No credit accounts yet. Credit checkout creates a customer ledger.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-[10px] uppercase tracking-wide text-slate-500">
                <tr><th className="px-4 py-3">Customer</th><th className="px-4 py-3">Phone</th><th className="px-4 py-3 text-right">Credit Total</th><th className="px-4 py-3 text-right">Payments</th><th className="px-4 py-3 text-right">Balance</th><th className="px-4 py-3 text-right">Action</th></tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {customers.map((customer) => (
                  <tr key={customer.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 font-bold text-slate-800">{customer.name}</td>
                    <td className="px-4 py-3 font-mono text-slate-600">{customer.phone}</td>
                    <td className="px-4 py-3 text-right">${Number(customer.totalCredit || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">${Number(customer.totalPaid || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right font-black text-amber-800">${Number(customer.balance || 0).toFixed(2)}</td>
                    <td className="px-4 py-3 text-right">
                      <button type="button" disabled={Number(customer.balance) <= 0} onClick={() => { setPaymentCustomer(customer); setPaymentAmount(''); setPaymentNote(''); }} className="rounded-lg bg-emerald-600 px-3 py-1.5 font-bold text-white disabled:bg-slate-300">Record Payment</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {customers.some((customer) => customer.ledger?.length) && (
        <section className="space-y-3">
          <h3 className="flex items-center gap-2 font-bold text-slate-800"><History className="h-4 w-4 text-emerald-600" />Recent Ledger Activity</h3>
          <div className="space-y-2">
            {customers.flatMap((customer) => (customer.ledger || []).map((entry) => ({ ...entry, customerName: customer.name, customerPhone: customer.phone })))
              .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
              .slice(0, 30)
              .map((entry) => (
                <div key={entry.id} className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs">
                  <div><strong>{entry.customerName}</strong><span className="ml-2 text-slate-500">{entry.customerPhone} · {entry.note}</span></div>
                  <span className={`font-mono font-bold ${entry.type === 'credit' ? 'text-amber-700' : 'text-emerald-700'}`}>{entry.type === 'credit' ? '+' : '-'}${Number(entry.amount).toFixed(2)}</span>
                </div>
              ))}
          </div>
        </section>
      )}

      {paymentCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4">
          <form onSubmit={savePayment} className="w-full max-w-md space-y-4 rounded-2xl bg-white p-6 shadow-2xl">
            <h3 className="flex items-center gap-2 font-bold text-slate-900"><CircleDollarSign className="h-5 w-5 text-emerald-600" />Record Customer Repayment</h3>
            <p className="text-xs text-slate-600">{paymentCustomer.name} · Outstanding ${Number(paymentCustomer.balance).toFixed(2)}</p>
            <label className="block text-xs font-semibold text-slate-700">Amount
              <input required type="number" min="0.01" max={paymentCustomer.balance} step="0.01" value={paymentAmount} onChange={(event) => setPaymentAmount(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <label className="block text-xs font-semibold text-slate-700">Note (optional)
              <input type="text" maxLength="160" value={paymentNote} onChange={(event) => setPaymentNote(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2" />
            </label>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setPaymentCustomer(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-xs font-semibold">Cancel</button>
              <button type="submit" disabled={savingPayment} className="rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white disabled:bg-slate-300">{savingPayment ? 'Saving...' : 'Save Payment'}</button>
            </div>
          </form>
        </div>
      )}
    </section>
  );
}
