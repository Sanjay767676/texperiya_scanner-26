import { useEffect, useRef, useState, useCallback } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import scannerLogo from "@assets/skeleton.png";
import "./scanner.css";

type ScanStatus = "scanning" | "processing" | "success" | "already_scanned" | "invalid" | "error" | "camera_error";
type EndpointType = "attendance" | "lunch";

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
  } catch (_) { }
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

function extractToken(qrData: string): string {
  const trimmed = qrData.trim();
  try {
    const url = new URL(trimmed);
    const tokenParam = url.searchParams.get("token");
    if (tokenParam) return tokenParam;
    const pathMatch = url.pathname.match(/\/scan\/(.+)/);
    if (pathMatch) return pathMatch[1].replace(/\/+$/, "");
  } catch (_) { }
  const queryMatch = trimmed.match(/[?&]token=([^\s&#]+)/);
  if (queryMatch) return queryMatch[1];
  const pathMatch = trimmed.match(/\/scan\/([^\s?#]+)/);
  if (pathMatch) return pathMatch[1].replace(/\/+$/, "");
  return trimmed;
}

export default function ScannerPage() {
  const [scanResult, setScanResult] = useState<ScanResult>({ status: "scanning" });
  const [scanCount, setScanCount] = useState(0);
  const [backendStatus, setBackendStatus] = useState<"connecting" | "connected" | "unreachable">("connecting");
  const [debugMode, setDebugMode] = useState(false);
  const [lastResponse, setLastResponse] = useState<any>(null);
  const [lastLatency, setLastLatency] = useState<number>(0);
  const [currentEndpoint, setCurrentEndpoint] = useState<EndpointType>("attendance");
  
  const { toast } = useToast();

  const isProcessingRef = useRef(false);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineQueueRef = useRef<QueuedScan[]>([]);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net";

  useEffect(() => {
    console.log(`[Scanner] App Startup - API Base URL: ${API_BASE_URL}`);
  }, [API_BASE_URL]);

  const checkHealth = useCallback(async () => {
    try {
      // Hit local proxy health check (vibration for CORS reliability)
      const response = await fetch("/api/health", { signal: AbortSignal.timeout(5000) });
      if (response.ok) {
        setBackendStatus("connected");
      } else {
        // If the local proxy exists but Azure is down, backend status reflects that
        setBackendStatus("unreachable");
      }
    } catch (err) {
      setBackendStatus("unreachable");
    }
  }, []);

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
    } catch (_) { }
  }, []);

  const addToOfflineQueue = useCallback((qrData: string) => {
    const exists = offlineQueueRef.current.some(item => item.qrData === qrData);
    if (!exists) {
      offlineQueueRef.current.push({
        qrData,
        timestamp: Date.now(),
        retries: 0
      });
      console.log(`[Scanner] Added to offline queue: ${qrData}`);
    }
  }, []);

  const processOfflineQueue = useCallback(async () => {
    if (offlineQueueRef.current.length === 0) return;

    const queue = [...offlineQueueRef.current];
    offlineQueueRef.current = [];

    for (const item of queue) {
      try {
        const token = extractToken(item.qrData);
        const url = "/api/scan"; // Default to scan for offline queue
        const response = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token, qrData: item.qrData }),
          signal: AbortSignal.timeout(15000)
        });

        if (response.ok) {
          const data = await response.json();
          if (data.success) {
            setScanCount((c) => c + 1);
            console.log(`[Scanner] Offline scan processed: ${item.qrData}`);
          }
        } else if (item.retries < 3) {
          offlineQueueRef.current.push({ ...item, retries: item.retries + 1 });
        }
      } catch (err) {
        if (item.retries < 3) {
          offlineQueueRef.current.push({ ...item, retries: item.retries + 1 });
        }
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    checkHealth();

    const healthInterval = setInterval(checkHealth, 30000);
    retryIntervalRef.current = setInterval(processOfflineQueue, 5000);

    return () => {
      mountedRef.current = false;
      clearInterval(healthInterval);
      if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
      if (bannerTimeoutRef.current) clearTimeout(bannerTimeoutRef.current);
      if (retryIntervalRef.current) clearInterval(retryIntervalRef.current);
    };
  }, [processOfflineQueue, checkHealth]);

  const processResponse = useCallback((data: any, statusCode?: number) => {
    setLastResponse(data);
    const message = data?.message || data?.error || "";
    const studentName = data?.studentName || data?.name || "";
    const senderType = data?.senderType || "";

    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
    }

    // Handle specific backend messages according to requirements
    const messageText = message.toLowerCase();
    
    if (messageText.includes("marked status")) {
      // Attendance Scans - Success
      toast({
        title: "Attendance Marked",
        description: studentName ? `${studentName} - Attendance recorded` : "Attendance successfully recorded",
        variant: "default"
      });
      setScanResult({ status: "success", name: studentName, message: "Attendance Marked" });
      setScanCount((c) => c + 1);
      playSuccessSound();
      triggerHaptic();
    } else if (messageText.includes("already marked")) {
      // Attendance Scans - Warning
      toast({
        title: "Already Scanned", 
        description: "This attendance has already been marked",
        variant: "destructive"
      });
      setScanResult({ status: "already_scanned", message: "Already Marked" });
      playWarningSound();
    } else if (messageText.includes("lunch token marked")) {
      // Lunch Scans - Success
      toast({
        title: "Lunch Token Marked",
        description: studentName ? `${studentName} - Lunch token recorded` : "Lunch token successfully recorded", 
        variant: "default"
      });
      setScanResult({ status: "success", name: studentName, message: "Lunch Token Marked" });
      setScanCount((c) => c + 1);
      playSuccessSound();
      triggerHaptic();
    } else if (messageText.includes("luchh token alredy availed") || messageText.includes("lunch token already availed")) {
      // Lunch Scans - Warning (keeping the original typo for API compatibility)
      toast({
        title: "Already Availed",
        description: "This lunch token has already been used",
        variant: "destructive"
      });
      setScanResult({ status: "already_scanned", message: "Already Availed" });
      playWarningSound();
    } else if (statusCode === 409) {
      // Fallback for 409 status code
      toast({
        title: "Already Processed",
        description: message || "This item has already been processed",
        variant: "destructive"
      });
      setScanResult({ status: "already_scanned", message: "Already Processed" });
      playWarningSound();
    } else if (data?.success === true || messageText.includes("success")) {
      // Generic success
      toast({
        title: "Success",
        description: message || "Successfully processed",
        variant: "default"
      });
      setScanResult({ status: "success", name: studentName, message: "Success" });
      setScanCount((c) => c + 1);
      playSuccessSound();
      triggerHaptic();
    } else {
      // Error cases
      const errorTitle = messageText.includes("invalid") ? "Invalid QR Code" : "Error";
      const errorDesc = message || "Something went wrong";
      
      toast({
        title: errorTitle,
        description: errorDesc,
        variant: "destructive"
      });
      setScanResult({ 
        status: messageText.includes("invalid") ? "invalid" : "error", 
        message: errorDesc 
      });
      playErrorSound();
    }

    // Reset scanner after 2 seconds
    bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
  }, [resetScanner, triggerHaptic, toast]);

  const handleScan = useCallback(async (results: any[], isRetry = false) => {
    if (!results || results.length === 0 || (isProcessingRef.current && !isRetry)) return;
    const decodedText = results[0]?.rawValue || (typeof results === 'string' ? results : null);
    if (!decodedText) return;

    const now = Date.now();
    if (!isRetry && decodedText === lastScannedRef.current && now - lastScanTimeRef.current < 2000) {
      return;
    }

    isProcessingRef.current = true;
    if (!isRetry) {
      lastScannedRef.current = decodedText;
      lastScanTimeRef.current = now;
      setScanResult({ status: "processing" });
    }

    const startTime = Date.now();
    try {
      const token = extractToken(decodedText);
      const url = currentEndpoint === "lunch" ? "/api/lunch" : "/api/scan";
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, qrData: decodedText }),
        signal: AbortSignal.timeout(20000),
      });

      const latency = Date.now() - startTime;
      setLastLatency(latency);
      if (latency > 2000) {
        console.warn(`[Scanner] Slow Response: ${latency}ms for ${decodedText}`);
      }

      console.log(`[Scanner] POST ${url} ${response.status} in ${latency}ms`);

      if (!response.ok) {
        const errorData = await response.json().catch(() => null);

        // Auto-retry once after 1 second if not already retrying
        if (!isRetry && response.status >= 500) {
          console.log("[Scanner] Server error, retrying in 1s...");
          setTimeout(() => handleScan([{ rawValue: decodedText }], true), 1000);
          return;
        }

        if (errorData) {
          processResponse(errorData, response.status);
        } else {
          const statusText = response.status === 404 ? "Invalid Endpoint" : response.status >= 500 ? "Server Error" : "Network Error";
          setScanResult({ status: "error", message: statusText });
          playErrorSound();
          bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
        }
      } else {
        const data = await response.json();
        if (!mountedRef.current) return;
        processResponse(data);
      }
    } catch (err: any) {
      if (!mountedRef.current) return;
      const latency = Date.now() - startTime;
      setLastLatency(latency);

      console.error(`[Scanner] Request failed: ${err.message} (${latency}ms)`);

      // Auto-retry once after 1 second if not already retrying
      if (!isRetry && err.name !== "AbortError") {
        console.log("[Scanner] Connection error, retrying in 1s...");
        setTimeout(() => handleScan([{ rawValue: decodedText }], true), 1000);
        return;
      }

      const isNetworkError = err.name === "AbortError" || err.message?.includes("fetch") || err.message?.includes("network");
      if (isNetworkError) {
        addToOfflineQueue(decodedText);
      }

      const errMsg = err.name === "AbortError" ? "Request Timeout" : "Network Error";
      setScanResult({ status: "error", message: errMsg });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
    } finally {
      resetTimeoutRef.current = setTimeout(() => {
        isProcessingRef.current = false;
      }, 300);
    }
  }, [resetScanner, processResponse, triggerHaptic, addToOfflineQueue]);

  const statusClass =
    scanResult.status === "success" ? "status-success" :
      scanResult.status === "already_scanned" ? "status-warning" :
        scanResult.status === "invalid" || scanResult.status === "error" || scanResult.status === "camera_error" ? "status-error" :
          scanResult.status === "processing" ? "status-processing" : "";

  return (
    <div className="scanner-page" data-testid="scanner-page">
      <header className="scanner-header" data-testid="scanner-header" onDoubleClick={() => setDebugMode(!debugMode)}>
        <div className="header-left">
          <img src={scannerLogo} alt="Scanner" className="header-logo" />
          <div className="header-text">
            <h1 className="header-title">Texperia</h1>
            <div className={`health-indicator ${backendStatus}`}>
              <span className="bullet">•</span>
              {backendStatus === "connected" ? "Backend Connected" : backendStatus === "connecting" ? "Connecting..." : "Server Unreachable"}
            </div>
          </div>
        </div>
        <div className="header-controls">
          <div className="endpoint-selector">
            <button 
              className={`endpoint-btn ${currentEndpoint === "attendance" ? "active" : ""}`}
              onClick={() => setCurrentEndpoint("attendance")}
              data-testid="btn-attendance"
            >
              Attendance
            </button>
            <button 
              className={`endpoint-btn ${currentEndpoint === "lunch" ? "active" : ""}`}
              onClick={() => setCurrentEndpoint("lunch")}
              data-testid="btn-lunch"
            >
              Lunch
            </button>
          </div>
          <div className="scan-counter" data-testid="text-scan-count">
            <span className="counter-number">{scanCount}</span>
            <span className="counter-label">scanned</span>
          </div>
        </div>
      </header>

      <div className="scanner-body">
        <div className="camera-wrapper" data-testid="camera-container">
          <Scanner
            onScan={handleScan}
            onError={(err: any) => {
              if (mountedRef.current) {
                // Show skeleton loader for camera permission instead of error
                setScanResult({
                  status: "camera_error",
                  message: "Requesting camera permission...",
                });
              }
            }}
            paused={false}
            scanDelay={100}
            constraints={{ 
              facingMode: "environment",
              width: { ideal: 1280 },  
              height: { ideal: 720 }
            }}
            formats={["qr_code"]}
            components={{ finder: false }}
            styles={{
              container: { width: "100%", height: "100%", padding: 0 },
              video: { 
                objectFit: "cover" as const,
                playsInline: true,
                muted: true,
                autoPlay: true
              },
            }}
          />
          <div className="scan-overlay">
            <div className="corner corner-tl" />
            <div className="corner corner-tr" />
            <div className="corner corner-bl" />
            <div className="corner corner-br" />
            {scanResult.status === "scanning" && <div className="scan-line" />}
          </div>

          {debugMode && (
            <div className="debug-overlay">
              <h3>DEBUG MODE</h3>
              <p>Latency: {lastLatency}ms</p>
              <p>Base URL: {API_BASE_URL}</p>
              <pre>{JSON.stringify(lastResponse, null, 2)}</pre>
              <button onClick={() => setDebugMode(false)}>Close</button>
            </div>
          )}
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="12" y1="8" x2="12" y2="12" /><line x1="12" y1="16" x2="12.01" y2="16" /></svg>
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" /></svg>
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
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><line x1="15" y1="9" x2="9" y2="15" /><line x1="9" y1="9" x2="15" y2="15" /></svg>
              </div>
              <div className="status-info">
                <span className="status-primary">Error</span>
                <span className="status-secondary">{scanResult.message}</span>
              </div>
            </div>
          )}

          {scanResult.status === "camera_error" && (
            <div className="status-row result-anim camera-loading" data-testid="status-camera-error">
              <div className="camera-skeleton">
                <Skeleton className="w-full h-8 mb-2" />
                <Skeleton className="w-3/4 h-4 mb-1" />
                <Skeleton className="w-1/2 h-4" />
              </div>
              <div className="status-info">
                <span className="status-primary">Camera Initializing...</span>
                <span className="status-secondary">Please allow camera permission when prompted</span>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

