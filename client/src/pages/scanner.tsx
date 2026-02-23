import { useEffect, useRef, useState, useCallback } from "react";
import { Html5Qrcode, Html5QrcodeScannerState } from "html5-qrcode";

type ScanStatus = "idle" | "scanning" | "processing" | "success" | "already_scanned" | "invalid" | "error" | "camera_error";

interface ScanResult {
  status: ScanStatus;
  name?: string;
  message?: string;
}

function playTone(frequency: number, duration: number, type: OscillatorType = "sine") {
  try {
    const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.type = type;
    osc.frequency.value = frequency;
    gain.gain.setValueAtTime(0.25, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + duration);
    osc.start(ctx.currentTime);
    osc.stop(ctx.currentTime + duration);
  } catch (_) {}
}

function playSuccessSound() {
  playTone(660, 0.12);
  setTimeout(() => playTone(880, 0.12), 100);
  setTimeout(() => playTone(1100, 0.18), 200);
}

function playWarningSound() {
  playTone(440, 0.15, "triangle");
  setTimeout(() => playTone(380, 0.2, "triangle"), 140);
}

function playErrorSound() {
  playTone(300, 0.15, "square");
  setTimeout(() => playTone(220, 0.25, "square"), 150);
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
      const s = scannerRef.current;
      if (s && s.getState() === Html5QrcodeScannerState.SCANNING) {
        s.pause(true);
      }
    } catch (_) {}
  }, []);

  const resumeScanner = useCallback(() => {
    try {
      const s = scannerRef.current;
      if (s && s.getState() === Html5QrcodeScannerState.PAUSED) {
        s.resume();
      }
    } catch (_) {}
  }, []);

  const resetScanner = useCallback(() => {
    if (!mountedRef.current) return;
    isProcessingRef.current = false;
    resumeScanner();
    setScanResult({ status: "scanning" });
  }, [resumeScanner]);

  const processResponse = useCallback((data: any) => {
    const st = (data.status || "").toLowerCase();
    const errMsg = data.error || data.message || "";

    if (data.success === true || st === "success" || st === "ok") {
      setScanResult({
        status: "success",
        name: data.name || data.senderType || "Attendee",
        message: "Attendance Marked",
      });
      setScanCount((c) => c + 1);
      playSuccessSound();
    } else if (st === "already_scanned" || st === "duplicate" || /already/i.test(errMsg)) {
      setScanResult({
        status: "already_scanned",
        message: errMsg || "Already Scanned",
      });
      playWarningSound();
    } else if (data.success === false && /unreachable|timeout|error/i.test(errMsg)) {
      setScanResult({
        status: "error",
        message: errMsg || "Server error. Try again.",
      });
      playErrorSound();
    } else if (st === "invalid" || /invalid/i.test(errMsg)) {
      setScanResult({
        status: "invalid",
        message: errMsg || "Invalid QR Code",
      });
      playErrorSound();
    } else if (data.error) {
      setScanResult({
        status: "error",
        message: errMsg || "Something went wrong",
      });
      playErrorSound();
    } else {
      setScanResult({
        status: "error",
        message: errMsg || "Unexpected response",
      });
      playErrorSound();
    }
  }, []);

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
      const timeoutId = setTimeout(() => controller.abort(), 15000);

      const response = await fetch("/api/scan", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData: decodedText }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);
        if (errorData) {
          processResponse(errorData);
        } else {
          throw new Error(`Server error: ${response.status}`);
        }
      } else {
        const data = await response.json();
        if (!mountedRef.current) return;
        processResponse(data);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      setScanResult({
        status: "error",
        message: err.name === "AbortError" ? "Request timed out. Try again." : "Connection error. Try again.",
      });
      playErrorSound();
    }

    resetTimeoutRef.current = setTimeout(() => {
      resetScanner();
    }, 2000);
  }, [resetScanner, pauseScanner, processResponse]);

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
            fps: 10,
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1,
            disableFlip: false,
          },
          (decodedText) => handleScan(decodedText),
          () => {}
        );

        if (mountedRef.current) setScanResult({ status: "scanning" });
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

  return (
    <div className="scanner-page" data-testid="scanner-page">
      <header className="scanner-header" data-testid="scanner-header">
        <div className="header-left">
          <h1 className="header-title">Texperia</h1>
          <p className="header-subtitle">Event Attendance Scanner</p>
        </div>
        <div className="scan-counter" data-testid="text-scan-count">
          <span className="counter-number">{scanCount}</span>
          <span className="counter-label">scanned</span>
        </div>
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

        <StatusOverlay result={scanResult} />
      </div>
    </div>
  );
}

function StatusOverlay({ result }: { result: ScanResult }) {
  const { status } = result;

  let overlayClass = "";
  if (status === "success") overlayClass = "overlay-success";
  else if (status === "already_scanned") overlayClass = "overlay-warning";
  else if (status === "invalid" || status === "error") overlayClass = "overlay-error";
  else if (status === "camera_error") overlayClass = "overlay-error";
  else if (status === "processing") overlayClass = "overlay-processing";

  return (
    <div className={`status-overlay ${overlayClass}`} data-testid="status-overlay">
      {status === "idle" && (
        <div className="status-content">
          <div className="loader" />
          <p className="status-text">Starting camera...</p>
        </div>
      )}

      {status === "scanning" && (
        <div className="status-content">
          <div className="pulse-ring" />
          <p className="status-text">Ready to scan</p>
          <p className="status-hint">Point camera at a QR code</p>
        </div>
      )}

      {status === "processing" && (
        <div className="status-content">
          <div className="loader" />
          <p className="status-text">Verifying attendance...</p>
          <p className="status-hint">Please wait</p>
        </div>
      )}

      {status === "success" && (
        <div className="status-content result-anim" data-testid="status-success">
          <div className="result-badge success-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
          </div>
          <p className="result-name">{result.name}</p>
          <p className="result-label">Attendance Marked</p>
        </div>
      )}

      {status === "already_scanned" && (
        <div className="status-content result-anim" data-testid="status-already-scanned">
          <div className="result-badge warning-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          </div>
          <p className="result-name">Already Marked</p>
          <p className="result-label">{result.message}</p>
        </div>
      )}

      {status === "invalid" && (
        <div className="status-content result-anim" data-testid="status-invalid">
          <div className="result-badge error-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </div>
          <p className="result-name">Invalid QR Code</p>
          <p className="result-label">{result.message}</p>
        </div>
      )}

      {status === "error" && (
        <div className="status-content result-anim" data-testid="status-error">
          <div className="result-badge error-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
          </div>
          <p className="result-name">Error</p>
          <p className="result-label">{result.message}</p>
        </div>
      )}

      {status === "camera_error" && (
        <div className="status-content result-anim" data-testid="status-camera-error">
          <div className="result-badge error-badge">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="5" x2="22" y2="19"/></svg>
          </div>
          <p className="result-name">Camera Access Required</p>
          <p className="result-label">{result.message}</p>
          <button className="retry-btn" data-testid="button-retry-camera" onClick={() => window.location.reload()}>
            Retry
          </button>
        </div>
      )}
    </div>
  );
}
