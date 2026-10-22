# Hafiz Pharmacy POS

### A Production-Ready, High-Speed, Offline-First Desktop Pharmacy Management & POS System

[![React](https://img.shields.io/badge/React-18-61DAFB?logo=react&logoColor=white)](https://react.dev/)
[![Vite](https://img.shields.io/badge/Vite-6-646CFF?logo=vite&logoColor=white)](https://vite.dev/)
[![Electron](https://img.shields.io/badge/Electron-33-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3-06B6D4?logo=tailwindcss&logoColor=white)](https://tailwindcss.com/)
[![License](https://img.shields.io/badge/License-Not%20specified-lightgrey)](#license)

## 💊 Project Overview

Hafiz Pharmacy POS is an offline-first Windows desktop point-of-sale and pharmacy management application built with Electron.js and React. It stores operational data locally in IndexedDB, so pharmacies can manage billing and inventory without cloud setup or an internet connection for normal day-to-day use. The application is designed for a responsive checkout workflow, local data ownership, and practical pharmacy stock management.

## ✨ Key Features & Capabilities

- **⚡ High-Speed POS Counter:** Barcode scanner input, FEFO (First Expiring, First Out) batch selection, live cart management, percentage and flat discounts, and dynamic cash change calculations.
- **🧾 80mm Thermal Receipt Printing:** Print-focused thermal receipts with aligned content and a generated SVG barcode.
- **📦 Inventory & Batch Tracking:** Batch-level stock and expiry tracking, expiry-risk alerts (including the 90-day warning window), low-stock warnings, and bulk stock imports from Excel (`.xlsx`) files.
- **🔎 Master Medicine Catalog:** More than 150 pre-mapped common medicine shortcuts to speed up manual inventory entry. Catalog shortcuts are references only; they do not create stock until a user adds an inventory batch.
- **↩️ Sales History & Restock Returns:** Itemized sales and return workflows, with returned quantities restored to inventory.
- **📊 Analytics & Auto-PO Generator:** Reports based on local sales and inventory data, plus low-stock Purchase Order generation and XLSX exports.
- **🛠️ System Maintenance:** Factory Reset / Clear Data controls and local JSON backup utilities.

## 🧰 Tech Stack

| Area | Technology |
| --- | --- |
| Frontend | React.js, Vite, Tailwind CSS, Lucide Icons |
| Desktop framework | Electron.js |
| Local database | IndexedDB (`src/services/localDb.js`) |
| Spreadsheet import and export | SheetJS (`xlsx`) |

## 🚀 Installation & Running Locally

### Prerequisites

- Node.js and npm
- Windows for running or packaging the desktop application

### Clone the repository

Replace `<repo_url>` with the URL of your repository:

```bash
git clone <repo_url>
cd hafiz-pharmacy-pos
```

### Install dependencies

```bash
npm install
```

### Start the Vite development server

```bash
npm run dev
```

### Run the Electron desktop app in development

```bash
npm run electron:dev
```

### Build and package the Windows installer

```bash
npm run electron:pack
```

The packaging command builds the application and creates a Windows installer in the configured `release` output directory.

## ⬇️ Release & Download

Windows users can download the latest available `.exe` installer from the repository's **GitHub Releases** tab. Open the [Releases page](../../releases), select a release, and download its installer asset.

## 👨‍💻 Author

**Muhammad Shahis** — Lead Software Engineer

## 📄 License

No license has been specified in the repository yet. Until a license is added, all rights remain with the copyright holder; contact the project owner for permission to use, modify, or redistribute this software.
