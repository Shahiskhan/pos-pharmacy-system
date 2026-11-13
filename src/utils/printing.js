export async function printDocument(targetId) {
  document.body.dataset.printTarget = targetId;
  try {
    if (window.electronAPI?.printReceipt) {
      const result = await window.electronAPI.printReceipt({ targetId });
      if (!result?.success) {
        throw new Error(result?.error || 'The print job could not be completed.');
      }
      return result;
    }

    window.print();
    return { success: true };
  } finally {
    delete document.body.dataset.printTarget;
  }
}
