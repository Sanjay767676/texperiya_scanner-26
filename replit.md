# Texperia QR Attendance Scanner

## Overview
A production-ready QR Code Attendance Scanner web app for the Texperia Event. Uses html5-qrcode for camera-based QR scanning and sends scanned data to an Azure backend for attendance marking.

## Architecture
- **Frontend**: React + Vite + TypeScript
- **Scanner Library**: html5-qrcode
- **Backend**: External Azure backend (no local backend logic needed)
- **Styling**: Custom CSS with dark theme

## Key Files
- `client/src/pages/scanner.tsx` - Main scanner component with camera integration, API calls, and status display
- `client/src/pages/scanner.css` - Dark theme styling for the scanner UI
- `client/src/App.tsx` - Root component rendering the scanner page

## Environment Variables
- `VITE_BASE_URL` - Azure backend base URL for API calls

## API Contract
- POST to `${VITE_BASE_URL}/api/scan` with `{ qrData: "SCANNED_VALUE" }`
- Fallback: POST to `${VITE_BASE_URL}/scan/<TOKEN>` if primary fails
- Handles responses with `success`/`status` fields

## How to Run
- `npm run dev` starts the Vite dev server on port 5000
