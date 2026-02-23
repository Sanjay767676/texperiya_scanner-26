import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";


type ScanStatus = "idle" | "scanning" | "processing" | "success" | "already_scanned" | "invalid" | "error" | "camera_error";

interface ScanResult {
  status: ScanStatus;
  name?: string;
  message?: string;
}

const SUCCESS_SOUND_FREQ = 880;
const ERROR_SOUND_FREQ = 300;

function playTone(frequency: number, duration: number, type: OscillatorType = "sine") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.3, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function playSuccessSound() {
  playTone(SUCCESS_SOUND_FREQ, 0.15);
  setTimeout(() => playTone(1100, 0.2), 120);
}

function playErrorSound() {
  playTone(ERROR_SOUND_FREQ, 0.2, "square");
  setTimeout(() => playTone(200, 0.3, "square"), 180);
}

function extractToken(qrData: string): string {
  const trimmed = qrData.trim();
  try {
    const url = new URL(trimmed);
    const pathMatch = url.pathname.match(/\/scan\/(.+)/);
    if (pathMatch) return pathMatch[1].replace(/\/+$/, "");
  } catch (_) {}
  const pathMatch = trimmed.match(/\/scan\/([^\s?#]+)/);
  if (pathMatch) return pathMatch[1].replace(/\/+$/, "");
  return trimmed;
}

export default function ScannerPage() {
  const [scanResult, setScanResult] = useState<ScanResult>({ status: "idle" });
  const [scanCount, setScanCount] = useState(0);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const isProcessingRef = useRef(false);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const pauseScanner = useCallback(() => {
    try {
      const scanner = scannerRef.current;
      if (scanner) {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.SCANNING) {
          scanner.pause(true);
        }
      }
    } catch (_) {}
  }, []);

  const resumeScanner = useCallback(() => {
    try {
      const scanner = scannerRef.current;
      if (scanner) {
        const state = scanner.getState();
        if (state === Html5QrcodeScannerState.PAUSED) {
          scanner.resume();
        }
      }
    } catch (_) {}
  }, []);

  const resetScanner = useCallback(() => {
    if (!mountedRef.current) return;
    isProcessingRef.current = false;
    resumeScanner();
    setScanResult({ status: "scanning" });
  }, [resumeScanner]);

  const handleScan = useCallback(async (decodedText: string) => {
    if (isProcessingRef.current) return;

    const now = Date.now();
    if (decodedText === lastScannedRef.current && now - lastScanTimeRef.current < 3000) {
      return;
    }

    isProcessingRef.current = true;
    lastScannedRef.current = decodedText;
    lastScanTimeRef.current = now;
    pauseScanner();
    setScanResult({ status: "processing" });

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 5000);

      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData: decodedText }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`Server error: ${response.status}`);
      }
      const data = await response.json();
      if (!mountedRef.current) return;
      processResponse(data);
    } catch (err: any) {
      if (!mountedRef.current) return;
      const msg = err.name === "AbortError" ? "Request timed out" : "Network error";
      setScanResult({ status: "error", message: msg });
      playErrorSound();
    }

    resetTimeoutRef.current = setTimeout(() => {
      resetScanner();
    }, 2000);
  }, [resetScanner, pauseScanner]);

  const processResponse = useCallback((data: any) => {
    if (data.success === true || data.status === "SUCCESS") {
      setScanResult({
        status: "success",
        name: data.name || "Attendee",
        message: data.status || "Present",
      });
      setScanCount((c) => c + 1);
      playSuccessSound();
    } else if (data.status === "ALREADY_SCANNED") {
      setScanResult({
        status: "already_scanned",
        message: data.message || "Already Scanned",
      });
      playErrorSound();
    } else if (data.status === "INVALID" || data.success === false) {
      setScanResult({
        status: "invalid",
        message: data.message || "Invalid QR Code",
      });
      playErrorSound();
    } else {
      setScanResult({
        status: "error",
        message: "Unexpected response",
      });
      playErrorSound();
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    let scanner: Html5Qrcode | null = null;

    const startScanner = async () => {
      try {
        scanner = new Html5Qrcode("qr-reader", { verbose: false });
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 15,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decodedText) => {
            handleScan(decodedText);
          },
          () => {}
        );

        if (mountedRef.current) {
          setScanResult({ status: "scanning" });
        }
      } catch (err: any) {
        console.error("Camera error:", err);
        if (mountedRef.current) {
          setScanResult({
            status: "camera_error",
            message: err?.message || "Camera access denied. Please allow camera permissions and reload.",
          });
        }
      }
    };

    startScanner();

    return () => {
      mountedRef.current = false;
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      if (scanner) {
        try {
          const state = scanner.getState();
          if (state === Html5QrcodeScannerState.SCANNING || state === Html5QrcodeScannerState.PAUSED) {
            scanner.stop().catch(() => {});
          }
        } catch (_) {}
      }
    };
  }, [handleScan]);

  const overlayClass = getOverlayClass(scanResult.status);

  return (
    <div className="scanner-page" data-testid="scanner-page">
      <header className="scanner-header" data-testid="scanner-header">
        <div className="header-content">
          <h1 className="header-title">Texperia</h1>
          <p className="header-subtitle">Event Attendance Scanner</p>
        </div>
        {scanCount > 0 && (
          <div className="scan-counter" data-testid="text-scan-count">
            <span className="counter-number">{scanCount}</span>
            <span className="counter-label">scanned</span>
          </div>
        )}
      </header>

      <div className="scanner-body">
        <div className="camera-container" data-testid="camera-container">
          <div id="qr-reader" className="qr-reader" />
          <div className="scan-frame">
            <div className="corner corner-tl" />
            <div className="corner corner-tr" />
            <div className="corner corner-bl" />
            <div className="corner corner-br" />
            {scanResult.status === "scanning" && <div className="scan-line" />}
          </div>
        </div>

        <div className={`status-overlay ${overlayClass}`} data-testid="status-overlay">
          {scanResult.status === "idle" && (
            <div className="status-content">
              <div className="status-spinner" />
              <p className="status-text">Initializing camera...</p>
            </div>
          )}

          {scanResult.status === "scanning" && (
            <div className="status-content">
              <div className="pulse-dot" />
              <p className="status-text">Ready to scan</p>
              <p className="status-hint">Point camera at QR code</p>
            </div>
          )}

          {scanResult.status === "processing" && (
            <div className="status-content">
              <div className="status-spinner" />
              <p className="status-text">Verifying...</p>
            </div>
          )}

          {scanResult.status === "success" && (
            <div className="status-content status-success" data-testid="status-success">
              <div className="result-icon success-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="20 6 9 17 4 12" />
                </svg>
              </div>
              <p className="result-title">{scanResult.name}</p>
              <p className="result-subtitle">Attendance Marked</p>
            </div>
          )}

          {scanResult.status === "already_scanned" && (
            <div className="status-content status-warning" data-testid="status-already-scanned">
              <div className="result-icon warning-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="12" y1="8" x2="12" y2="12" />
                  <line x1="12" y1="16" x2="12.01" y2="16" />
                </svg>
              </div>
              <p className="result-title">Already Scanned</p>
              <p className="result-subtitle">{scanResult.message}</p>
            </div>
          )}

          {scanResult.status === "invalid" && (
            <div className="status-content status-error" data-testid="status-invalid">
              <div className="result-icon error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18" />
                  <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
              </div>
              <p className="result-title">Invalid QR Code</p>
              <p className="result-subtitle">{scanResult.message}</p>
            </div>
          )}

          {scanResult.status === "error" && (
            <div className="status-content status-error" data-testid="status-error">
              <div className="result-icon error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="10" />
                  <line x1="15" y1="9" x2="9" y2="15" />
                  <line x1="9" y1="9" x2="15" y2="15" />
                </svg>
              </div>
              <p className="result-title">Error</p>
              <p className="result-subtitle">{scanResult.message}</p>
            </div>
          )}

          {scanResult.status === "camera_error" && (
            <div className="status-content status-camera-error" data-testid="status-camera-error">
              <div className="result-icon error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
                </svg>
              </div>
              <p className="result-title">Camera Access Required</p>
              <p className="result-subtitle">{scanResult.message}</p>
              <button
                className="retry-button"
                data-testid="button-retry-camera"
                onClick={() => window.location.reload()}
              >
                Retry
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function getOverlayClass(status: ScanStatus): string {
  switch (status) {
    case "success": return "overlay-success";
    case "already_scanned": return "overlay-warning";
    case "invalid":
    case "error": return "overlay-error";
    case "camera_error": return "overlay-camera-error";
    case "processing": return "overlay-processing";
    default: return "";
  }
}
