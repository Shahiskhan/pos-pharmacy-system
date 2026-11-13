const { app } = require('electron');

function getSenderOrigin(event) {
  const raw = event?.senderFrame?.url || event?.sender?.frame?.url || '';
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.origin;
  } catch {
    return null;
  }
}

function isValidSender(event) {
  const origin = getSenderOrigin(event);
  if (!origin) return false;

  if (app.isPackaged) {
    return origin.startsWith('file://');
  }

  return origin.startsWith('http://localhost:') || origin.startsWith('http://127.0.0.1:');
}

function blockDevtoolsInProd(webContents) {
  if (!webContents || app.isPackaged === false) return;

  webContents.on('before-input-event', (event, input) => {
    const isF12 = input.key === 'F12';
    const isDevtoolsCombo =
      (input.control && input.shift && input.key.toLowerCase() === 'i') ||
      (input.meta && input.alt && input.key.toLowerCase() === 'i');

    if (isF12 || isDevtoolsCombo) {
      event.preventDefault();
    }
  });
}

module.exports = {
  isValidSender,
  blockDevtoolsInProd,
};
