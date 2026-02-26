import { useEffect, useRef, useState, useCallback } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import scannerLogo from "@assets/skeleton.png";
import "./scanner.css";

type ScanStatus = "scanning" | "processing" | "success" | "already_scanned" | "invalid" | "error" | "camera_error";

interface ScanResult {
  status: ScanStatus;
  name?: string;
  message?: string;
}

interface QueuedScan {
  qrData: string;
  timestamp: number;
  retries: number;
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
  const [scanResult, setScanResult] = useState<ScanResult>({ status: "scanning" });
  const [scanCount, setScanCount] = useState(0);
  const isProcessingRef = useRef(false);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineQueueRef = useRef<QueuedScan[]>([]);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const resetScanner = useCallback(() => {
    if (!mountedRef.current) return;
    isProcessingRef.current = false;
    setScanResult({ status: "scanning" });
  }, []);

  const triggerHaptic = useCallback(() => {
    try {
      if (navigator.vibrate) {
        navigator.vibrate([100]);
      }
    } catch (_) {}
  }, []);

  const addToOfflineQueue = useCallback((qrData: string) => {
    // Check if already in queue
    const exists = offlineQueueRef.current.some(item => item.qrData === qrData);
    if (!exists) {
      offlineQueueRef.current.push({
        qrData,
        timestamp: Date.now(),
        retries: 0
      });
      console.log(`Added to offline queue: ${qrData}`);
    }
  }, []);

  const processOfflineQueue = useCallback(async () => {
    if (offlineQueueRef.current.length === 0) return;
    
    const queue = [...offlineQueueRef.current];
    offlineQueueRef.current = [];
    
    for (const item of queue) {
      try {
        const response = await fetch("/api/scan", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ qrData: item.qrData }),
          signal: AbortSignal.timeout(10000)
        });
        
        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setScanCount((c) => c + 1);
            console.log(`Offline scan processed: ${item.qrData}`);
          }
        } else {
          // Re-queue if not too many retries
          if (item.retries < 3) {
            offlineQueueRef.current.push({ ...item, retries: item.retries + 1 });
          }
        }
      } catch (err) {
        // Re-queue if network error and not too many retries
        if (item.retries < 3) {
          offlineQueueRef.current.push({ ...item, retries: item.retries + 1 });
        }
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    
    // Start retry interval for offline queue
    retryIntervalRef.current = setInterval(() => {
      processOfflineQueue();
    }, 5000); // Check every 5 seconds
    
    return () => {
      mountedRef.current = false;
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
    };
  }, [processOfflineQueue]);

  const processResponse = useCallback((data: any, statusCode?: number) => {
    const st = (data.status || "").toLowerCase();
    const errMsg = data.error || data.message || "";
    const studentName = data.studentName || data.name || "";
    const senderType = data.senderType || "";
    const displayName = studentName || senderType || "Attendee";

    // Clear any existing banner timeout
    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
    }

    // Handle 409 Conflict specifically
    if (statusCode === 409) {
      setScanResult({
        status: "already_scanned",
        message: "⚠️ ALREADY MARKED",
      });
      playWarningSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
      return;
    }

    if (data.success === true || st === "success" || st === "ok") {
      setScanResult({
        status: "success",
        name: displayName,
        message: `${senderType ? `[${senderType}]` : ""} Attendance Marked`.trim(),
      });
      setScanCount((c) => c + 1);
      playSuccessSound();
      triggerHaptic();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
    } else if (st === "already_scanned" || st === "duplicate" || /already/i.test(errMsg)) {
      setScanResult({
        status: "already_scanned",
        message: errMsg || "⚠️ ALREADY MARKED",
      });
      playWarningSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
    } else if (data.success === false && /unreachable|timeout|error/i.test(errMsg)) {
      setScanResult({
        status: "error",
        message: errMsg || "Server error. Try again.",
      });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
    } else if (st === "invalid" || /invalid/i.test(errMsg)) {
      setScanResult({
        status: "invalid",
        message: errMsg || "Invalid QR Code",
      });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
    } else if (data.error) {
      setScanResult({
        status: "error",
        message: errMsg || "Something went wrong",
      });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
    } else {
      setScanResult({
        status: "error",
        message: errMsg || "Unexpected response",
      });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
    }
  }, [resetScanner, triggerHaptic]);

  const handleScan = useCallback((results: any[]) => {
    if (!results || results.length === 0 || isProcessingRef.current) return;
    const decodedText = results[0]?.rawValue;
    if (!decodedText) return;

    const now = Date.now();
    // 2-second debounce for same QR code
    if (decodedText === lastScannedRef.current && now - lastScanTimeRef.current < 2000) {
      return;
    }

    isProcessingRef.current = true;
    lastScannedRef.current = decodedText;
    lastScanTimeRef.current = now;
    // Don't pause scanner - keep it active for next scan
    setScanResult({ status: "processing" });

    (async () => {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

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
            processResponse(errorData, response.status);
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
        
        // Add to offline queue if network error
        const isNetworkError = err.name === "AbortError" || err.message?.includes("fetch") || err.message?.includes("network");
        if (isNetworkError) {
          addToOfflineQueue(decodedText);
        }
        
        setScanResult({
          status: "error",
          message: err.name === "AbortError" ? "Request timed out. Try again." : "Connection error. Try again.",
        });
        playErrorSound();
        bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
      } finally {
        // Reset processing flag immediately to allow next scan
        resetTimeoutRef.current = setTimeout(() => {
          isProcessingRef.current = false;
        }, 300);
      }
    })();
  }, [resetScanner, processResponse, triggerHaptic, addToOfflineQueue]);

  const statusClass =
    scanResult.status === "success" ? "status-success" :
    scanResult.status === "already_scanned" ? "status-warning" :
    scanResult.status === "invalid" || scanResult.status === "error" || scanResult.status === "camera_error" ? "status-error" :
    scanResult.status === "processing" ? "status-processing" : "";

  return (
    <div className="scanner-page" data-testid="scanner-page">
      <header className="scanner-header" data-testid="scanner-header">
        <div className="header-left">
          <img src={scannerLogo} alt="Scanner" className="header-logo" />
          <div className="header-text">
            <h1 className="header-title">Texperia</h1>
            <p className="header-subtitle">Attendance Scanner</p>
          </div>
        </div>
        <div className="scan-counter" data-testid="text-scan-count">
          <span className="counter-number">{scanCount}</span>
          <span className="counter-label">scanned</span>
        </div>
      </header>

      <div className="scanner-body">
        <div className="camera-wrapper" data-testid="camera-container">
          <Scanner
            onScan={handleScan}
            onError={(err: any) => {
              if (mountedRef.current) {
                setScanResult({
                  status: "camera_error",
                  message: (typeof err === "string" ? err : err?.message) || "Camera access denied",
                });
              }
            }}
            paused={false}
            scanDelay={100}
            constraints={{ 
              facingMode: "environment"
            }}
            formats={["qr_code"]}
            components={{ finder: false }}
            styles={{
              container: { width: "100%", height: "100%", padding: 0 },
              video: { objectFit: "cover" as const },
            }}
          />
          <div className="scan-overlay">
            <div className="corner corner-tl" />
            <div className="corner corner-tr" />
            <div className="corner corner-bl" />
            <div className="corner corner-br" />
            {scanResult.status === "scanning" && <div className="scan-line" />}
          </div>
        </div>

        <div className={`status-bar ${statusClass}`} data-testid="status-overlay">
          {scanResult.status === "scanning" && (
            <div className="status-row">
              <div className="pulse-dot" />
              <span className="status-msg">Ready — point at QR code</span>
            </div>
          )}

          {scanResult.status === "processing" && (
            <div className="status-row">
              <div className="loader-sm" />
              <span className="status-msg">Verifying...</span>
            </div>
          )}

          {scanResult.status === "success" && (
            <div className="status-row result-anim" data-testid="status-success">
              <div className="status-icon success-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
              </div>
              <div className="status-info">
                <span className="status-primary">{scanResult.name}</span>
                <span className="status-secondary">Attendance Marked</span>
              </div>
            </div>
          )}

          {scanResult.status === "already_scanned" && (
            <div className="status-row result-anim" data-testid="status-already-scanned">
              <div className="status-icon warning-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              </div>
              <div className="status-info">
                <span className="status-primary">Already Marked</span>
                <span className="status-secondary">{scanResult.message}</span>
              </div>
            </div>
          )}

          {scanResult.status === "invalid" && (
            <div className="status-row result-anim" data-testid="status-invalid">
              <div className="status-icon error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
              </div>
              <div className="status-info">
                <span className="status-primary">Invalid QR</span>
                <span className="status-secondary">{scanResult.message}</span>
              </div>
            </div>
          )}

          {scanResult.status === "error" && (
            <div className="status-row result-anim" data-testid="status-error">
              <div className="status-icon error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><line x1="15" y1="9" x2="9" y2="15"/><line x1="9" y1="9" x2="15" y2="15"/></svg>
              </div>
              <div className="status-info">
                <span className="status-primary">Error</span>
                <span className="status-secondary">{scanResult.message}</span>
              </div>
            </div>
          )}

          {scanResult.status === "camera_error" && (
            <div className="status-row result-anim" data-testid="status-camera-error">
              <div className="status-icon error-icon">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="5" width="20" height="14" rx="2"/><line x1="2" y1="5" x2="22" y2="19"/></svg>
              </div>
              <div className="status-info">
                <span className="status-primary">Camera Access Required</span>
                <span className="status-secondary">{scanResult.message}</span>
              </div>
              <button className="retry-btn" data-testid="button-retry-camera" onClick={() => window.location.reload()}>Retry</button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
