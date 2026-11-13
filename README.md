# Generic Pharmacy POS

### A modern, production-oriented desktop POS template for developers and pharmacies

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](./LICENSE)

Generic Pharmacy POS is a white-label pharmacy point-of-sale and inventory management template. It combines a fast checkout workflow, batch-aware stock management, reporting, and desktop packaging in a codebase developers can adapt for their own pharmacy or retail workflow.

> **Deployment note:** This repository provides application software, not pharmacy, tax, privacy, or regulatory advice. Before using it in a live store, validate workflows, receipt requirements, data protection, backups, and applicable local regulations for your deployment.

## 🧭 Architecture & Design Philosophy

The application is designed around a **local-first / offline-first** model. The React renderer uses IndexedDB through [`src/services/localDb.js`](./src/services/localDb.js) for operational records such as inventory, batches, sales, suppliers, and local store configuration. This keeps common reads and writes on the device and avoids requiring a cloud account, server, or network connection for normal local workflows.

The desktop application runs in Electron, while Vite also supports browser-based development. The UI is organized into views and reusable components; data access and business operations are kept in the local database service. Store branding can be changed through [`src/config/storeConfig.js`](./src/config/storeConfig.js), and store name/license overrides can be saved from the Settings view.

Local-first storage means records belong to the application profile on that device. It is not automatically synchronized between computers. Set up and test a reliable backup and restore process before relying on a production deployment.

## ✨ Capabilities

- Barcode-oriented POS search and FEFO (First Expiring, First Out) batch selection
- Keyboard-wedge USB barcode scanning with fast keystroke capture
- Cart checkout with percentage or fixed discounts, tax, and tender/change calculations
- Silent Electron printing for 80mm thermal receipts and Purchase Orders
- Strict expired-batch blocking at selection and atomic checkout
- Inventory and batch management with expiry and low-stock indicators
- Common-medicine shortcut catalog for manual stock entry
- Sales history, returns, and local stock restoration
- Customer credit (Udhaar) accounts, ledger history, and repayment tracking
- Sales analytics, low-stock Purchase Order generation, and spreadsheet exports
- Local JSON database backup and factory-reset controls
- Automatic daily local JSON backups and a backup attempt before application exit
- White-label store identity customization

## 🔐 Admin Panel Setup

The application now includes a secure admin console for managing users, content, reports, notifications, and site settings from a single panel.

### Admin registration via environment variables

Copy the example environment file and update the values before running the app:

```bash
copy .env.example .env
```

Then set the following values in `.env`:

```env
VITE_ADMIN_USERNAME=admin
VITE_ADMIN_EMAIL=admin@pharmacy.local
VITE_ADMIN_PASSWORD=admin123
VITE_ADMIN_RESET_SECRET=change-this-secret
```

The first admin account is created from these environment variables. The same admin panel also lets the configured admin reset their password later using the reset secret stored in `.env`.

### Accessing the admin panel

- Open the app and select the new `Admin Panel` item in the sidebar.
- Login with the environment username and password.
- Once logged in, you can manage:
  - User Management
  - Content Management
  - Reports & Analytics
  - Settings
  - Notifications

## 🧰 Tech Stack

| Layer | Technology |
| --- | --- |
| Frontend | React 18, Vite 6, Tailwind CSS 3, Lucide |
| Desktop runtime | Electron 33 |
| Local database | IndexedDB via `src/services/localDb.js` |
| Spreadsheet import/export | SheetJS (`xlsx`) |
| Desktop packaging | electron-builder (Windows NSIS installer) |

## 🗂️ Project Structure

```text
.
├── electron/                 # Electron main and preload processes
├── src/
│   ├── components/
│   │   ├── layout/           # App shell, navigation, and header
│   │   └── pos/              # Checkout and receipt components
│   ├── config/               # Default store identity and app configuration
│   ├── hooks/                # Shared React hooks
│   ├── services/             # IndexedDB persistence and data operations
│   ├── utils/                # Shared static data and utilities
│   ├── views/                # Dashboard, billing, inventory, reports, settings
│   ├── App.jsx               # Application routes and layout
│   ├── index.css             # Global styles and print rules
│   └── main.jsx              # React application entry point
├── index.html
├── package.json
└── vite.config.js
```

## 🚀 Quick Start for Developers

### Prerequisites

- Node.js and npm
- Windows for building and running the packaged `.exe` installer

### Clone and install

```bash
git clone <repo_url>
cd <repository-directory>
npm install
```

Replace `<repo_url>` with the repository URL and `<repository-directory>` with the directory created by `git clone`.

### Run in browser mode

```bash
npm run dev
```

Vite prints the local development URL in the terminal.

### Run as an Electron desktop app

```bash
npm run electron:dev
```

### Build a standalone Windows installer

```bash
npm run electron:pack
```

The build output is written to `release/`. Packaging produces a Windows NSIS installer.

### Validate a change

```bash
npm run build
```

## 🏷️ Customization & White-Labeling

Edit [`src/config/storeConfig.js`](./src/config/storeConfig.js) to set the default store identity:

```js
export const storeConfig = {
  appName: 'Your Pharmacy POS',
  tagline: 'Advanced Desktop Pharmacy Management',
  address: 'Your store address',
  phone: 'Your store phone',
  licenseNumber: 'Your pharmacy license',
  defaultOperator: 'Store Operator • Shift 1',
};
```

The store name and license number can also be changed in **Settings → Store Identity & Receipt Details**. Those two values are saved locally in IndexedDB and applied to supported application branding, receipts, reports, and purchase orders. The other fields above are source defaults; update the UI/data flow as needed if you want to edit them inside the application.

To rebrand the Windows executable and shortcuts, update the `build.productName` and `build.nsis.shortcutName` values in `package.json`. The Electron window and HTML document titles currently use the generic default and can be changed in `electron/main.js` and `index.html` respectively.

## 🤝 Contributing

Contributions are welcome. To propose a change:

1. Fork the repository and create a focused branch from the default branch.
2. Keep changes scoped, follow the existing code patterns, and include tests or reproducible verification where practical.
3. Run `npm run build` and review the resulting changes before opening a pull request.
4. In the pull request, describe the user impact, implementation, and validation performed. Include screenshots for UI changes when useful.
5. Do not include credentials, real patient information, or other sensitive production data in issues, pull requests, or test fixtures.

For significant behavior or architecture changes, open an issue first to discuss the proposal.

## 📄 License

This project is distributed under the [MIT License](./LICENSE). See the `LICENSE` file for the complete terms.
