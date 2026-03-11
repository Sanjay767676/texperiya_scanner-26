import { useEffect, useRef, useState, useCallback } from "react";
import { Scanner } from "@yudiel/react-qr-scanner";
import { useToast } from "@/hooks/use-toast";
import { Skeleton } from "@/components/ui/skeleton";
import {
  checkScannerHealth,
  SCANNER_API_BASE_URL,
  submitScan,
  type ScanUiResult,
  type ScannerMode,
} from "@/lib/scannerApi";
import scannerLogo from "@assets/skeleton.png";
import "./scanner.css";

type ScanStatus = "scanning" | "processing" | "success" | "already_scanned" | "invalid" | "error" | "camera_error";
type EndpointType = ScannerMode;
type CameraFacingMode = "environment" | "user";

interface ScanResult {
  status: ScanStatus;
  name?: string;
  message?: string;
  scanType?: EndpointType;
  senderType?: "CS" | "NCS";
}

interface QueuedScan {
  qrData: string;
  timestamp: number;
  retries: number;
  endpoint: EndpointType;
}

function inferEndpointFromToken(token: string): EndpointType {
  const upper = token.trim().toUpperCase();
  if (upper.startsWith("CSL-") || upper.startsWith("NCSL-")) {
    return "lunch";
  }
  return "attendance";
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
  const [cameraPermissionGranted, setCameraPermissionGranted] = useState<boolean>(false);
  const [availableCameras, setAvailableCameras] = useState<MediaDeviceInfo[]>([]);
  const [selectedCameraId, setSelectedCameraId] = useState<string | null>(null);
  const [preferredFacingMode, setPreferredFacingMode] = useState<CameraFacingMode>("environment");
  
  const { toast } = useToast();

  const isProcessingRef = useRef(false);
  const lastScannedRef = useRef<string>("");
  const lastScanTimeRef = useRef<number>(0);
  const mountedRef = useRef(true);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bannerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const offlineQueueRef = useRef<QueuedScan[]>([]);
  const retryIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const checkHealth = useCallback(async () => {
    const healthy = await checkScannerHealth();
    setBackendStatus(healthy ? "connected" : "unreachable");
  }, []);

  const refreshAvailableCameras = useCallback(async () => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setAvailableCameras([]);
      return [] as MediaDeviceInfo[];
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const videoInputs = devices.filter((device) => device.kind === "videoinput");

      setAvailableCameras(videoInputs);
      setSelectedCameraId((currentCameraId) => {
        if (currentCameraId && videoInputs.some((device) => device.deviceId === currentCameraId)) {
          return currentCameraId;
        }

        const preferredDevice = videoInputs.find((device) =>
          /back|rear|environment|world/i.test(device.label),
        );

        return preferredDevice?.deviceId ?? videoInputs[0]?.deviceId ?? null;
      });

      return videoInputs;
    } catch (err) {
      console.warn("[Scanner] Unable to enumerate cameras:", err);
      setAvailableCameras([]);
      return [] as MediaDeviceInfo[];
    }
  }, []);

  const checkCameraPermission = useCallback(async (requestedFacingMode: CameraFacingMode = preferredFacingMode) => {
    try {
      if (navigator.permissions?.query) {
        const permission = await navigator.permissions.query({ name: "camera" as PermissionName });

        if (permission.state === "granted") {
          setCameraPermissionGranted(true);
          setScanResult({ status: "scanning" });
          await refreshAvailableCameras();
          return true;
        }

        if (permission.state === "denied") {
          setScanResult({ 
            status: "camera_error", 
            message: "Camera permission denied. Please enable in browser settings." 
          });
          return false;
        }
      }
      
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ 
          video: { facingMode: requestedFacingMode } 
        });
        stream.getTracks().forEach(track => track.stop());
        setCameraPermissionGranted(true);
        setScanResult({ status: "scanning" });
        await refreshAvailableCameras();
        return true;
      } catch (mediaErr) {
        setScanResult({ 
          status: "camera_error", 
          message: "Requesting camera permission..." 
        });
        return false;
      }
    } catch (err) {
      console.warn("[Scanner] Camera permission check failed:", err);
      setScanResult({ status: "camera_error", message: "Requesting camera permission..." });
      return false;
    }
  }, [preferredFacingMode, refreshAvailableCameras]);

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

  const addToOfflineQueue = useCallback((qrData: string, endpoint: EndpointType) => {
    const exists = offlineQueueRef.current.some(
      (item) => item.qrData === qrData && item.endpoint === endpoint,
    );
    if (!exists) {
      offlineQueueRef.current.push({
        qrData,
        timestamp: Date.now(),
        retries: 0,
        endpoint,
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
        const result = await submitScan(item.endpoint, { token, qrData: item.qrData });

        if (result.status === "success") {
          setScanCount((c) => c + 1);
          console.log(`[Scanner] Offline scan processed: ${item.qrData}`);
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

  const handleSwitchCamera = useCallback(async () => {
    if (!cameraPermissionGranted) {
      const granted = await checkCameraPermission();
      if (!granted) return;
    }

    isProcessingRef.current = false;
    lastScannedRef.current = "";
    lastScanTimeRef.current = 0;
    setScanResult({ status: "scanning" });

    if (availableCameras.length > 1) {
      setSelectedCameraId((currentCameraId) => {
        const currentIndex = availableCameras.findIndex((device) => device.deviceId === currentCameraId);
        const nextIndex = currentIndex >= 0 ? (currentIndex + 1) % availableCameras.length : 0;
        return availableCameras[nextIndex]?.deviceId ?? currentCameraId;
      });
      return;
    }

    const nextFacingMode = preferredFacingMode === "environment" ? "user" : "environment";
    setPreferredFacingMode(nextFacingMode);
    await refreshAvailableCameras();
  }, [availableCameras, cameraPermissionGranted, checkCameraPermission, preferredFacingMode, refreshAvailableCameras]);

  const scannerConstraints: MediaTrackConstraints = {
    ...(selectedCameraId ? { deviceId: selectedCameraId } : { facingMode: preferredFacingMode }),
    width: { ideal: 1280 },
    height: { ideal: 720 },
  };

  const activeCameraLabel = selectedCameraId
    ? availableCameras.find((device) => device.deviceId === selectedCameraId)?.label || "Camera"
    : preferredFacingMode === "environment"
      ? "Rear camera"
      : "Front camera";

  useEffect(() => {
    mountedRef.current = true;
    
    // Check camera permissions first
    checkCameraPermission();
    
    // Check backend health
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
  }, [processOfflineQueue, checkHealth, checkCameraPermission]);

  useEffect(() => {
    if (!cameraPermissionGranted || !navigator.mediaDevices?.addEventListener) return;

    const handleDeviceChange = () => {
      void refreshAvailableCameras();
    };

    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [cameraPermissionGranted, refreshAvailableCameras]);

  const processResponse = useCallback((result: ScanUiResult, requestMode: EndpointType) => {
    setLastResponse(result);

    if (bannerTimeoutRef.current) {
      clearTimeout(bannerTimeoutRef.current);
    }

    if (result.status === "success") {
      const scanType = result.data?.scanType || requestMode;
      const successTitle = scanType === "lunch" ? "Lunch Marked" : "Attendance Marked";

      toast({
        title: successTitle,
        description: result.message || successTitle,
        variant: "default",
      });
      setScanResult({
        status: "success",
        name: result.message || "Success",
        message: result.message,
        scanType,
        senderType: result.data?.senderType,
      });
      setScanCount((c) => c + 1);
      playSuccessSound();
      triggerHaptic();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
      return;
    }

    if (result.status === "already_marked") {
      toast({
        title: "Already Marked",
        description: result.message || "This QR has already been processed",
        variant: "destructive",
      });
      setScanResult({ status: "already_scanned", message: result.message });
      playWarningSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
      return;
    }

    if (result.status === "wrong_mode") {
      toast({
        title: "Wrong Scanner Mode",
        description: result.message,
        variant: "destructive",
      });
      setScanResult({ status: "error", message: "Wrong scanner mode for this QR" });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2500);
      return;
    }

    if (result.status === "invalid_qr") {
      toast({
        title: "Invalid QR Code",
        description: result.message || "Invalid token format",
        variant: "destructive",
      });
      setScanResult({ status: "invalid", message: result.message });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2500);
      return;
    }

    if (result.status === "unauthorized") {
      toast({
        title: "Security Error",
        description: "Invalid scanner secret",
        variant: "destructive",
      });
      setScanResult({
        status: "error",
        message: "Security Error: Invalid Secret",
      });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 3000);
      return;
    }

    toast({
      title: "Connection Error",
      description: result.message || `Connection Error: ${result.httpStatus || "Network"}`,
      variant: "destructive",
    });
    setScanResult({
      status: "error",
      message: result.message || `Connection Error: ${result.httpStatus || "Network"}`,
    });
    playErrorSound();
    bannerTimeoutRef.current = setTimeout(resetScanner, 2500);
  }, [resetScanner, toast, triggerHaptic]);

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
    const token = extractToken(decodedText);
    const endpoint = inferEndpointFromToken(token);
    try {
      console.log(`[Scanner] Scanning token: ${token} using endpoint: ${endpoint}`);

      const result = await submitScan(endpoint, { token, qrData: decodedText });

      const latency = Date.now() - startTime;
      setLastLatency(latency);
      if (latency > 2000) {
        console.warn(`[Scanner] Slow Response: ${latency}ms for ${decodedText}`);
      }

      if (!mountedRef.current) return;
      console.log(`[Scanner] POST ${endpoint} ${result.httpStatus} in ${latency}ms`);

      if (!isRetry && (result.httpStatus >= 500 || result.httpStatus === 0)) {
        console.log("[Scanner] Temporary backend issue, retrying in 1s...");
        setTimeout(() => handleScan([{ rawValue: decodedText }], true), 1000);
        return;
      }
      processResponse(result, endpoint);
    } catch (err: any) {
      if (!mountedRef.current) return;
      const latency = Date.now() - startTime;
      setLastLatency(latency);

      console.error(`[Scanner] Request failed: ${err.message} (${latency}ms)`);

      if (!isRetry) {
        console.log("[Scanner] Connection error, retrying in 1s...");
        setTimeout(() => handleScan([{ rawValue: decodedText }], true), 1000);
        return;
      }

      addToOfflineQueue(decodedText, endpoint);
      setScanResult({ status: "error", message: "Network Error" });
      playErrorSound();
      bannerTimeoutRef.current = setTimeout(resetScanner, 2000);
    } finally {
      resetTimeoutRef.current = setTimeout(() => {
        isProcessingRef.current = false;
      }, 300);
    }
  }, [resetScanner, processResponse, addToOfflineQueue]);

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
          <div className="scan-mode-hint" data-testid="scan-mode-hint">
            CS/NCS = Attendance | CSL/NCSL = Lunch
          </div>
          <div className="scan-counter" data-testid="text-scan-count">
            <span className="counter-number">{scanCount}</span>
            <span className="counter-label">scanned</span>
          </div>
        </div>
      </header>

      <div className="scanner-body">
        <div className="camera-wrapper" data-testid="camera-container">
          {cameraPermissionGranted ? (
            <Scanner
              onScan={handleScan}
              onError={(err: any) => {
                if (mountedRef.current) {
                  console.warn("[Scanner] Camera error:", err);
                  setScanResult({
                    status: "camera_error",
                    message: "Camera initialization failed. Please refresh.",
                  });
                }
              }}
              paused={false}
              scanDelay={100}
              constraints={scannerConstraints}
              formats={["qr_code"]}
              components={{ 
                finder: false,
                torch: false,
                zoom: false
              }}
              allowMultiple={false}
              styles={{
                container: { 
                  width: "100%", 
                  height: "100%", 
                  padding: 0,
                  backgroundColor: "transparent",
                  borderRadius: "16px",
                  overflow: "hidden"
                },
                video: { 
                  objectFit: "cover" as const,
                  width: "100%",
                  height: "100%",
                  borderRadius: "16px"
                },
              }}
            />
          ) : (
            <div className="camera-placeholder">
              {scanResult.status === "camera_error" && scanResult.message?.includes("denied") ? (
                <div className="camera-denied">
                  <div className="status-icon error-icon">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                      <rect x="2" y="5" width="20" height="14" rx="2" />
                      <line x1="2" y1="5" x2="22" y2="19" />
                    </svg>
                  </div>
                  <p>Camera permission denied</p>
                  <button onClick={() => window.location.reload()} className="retry-btn">
                    Enable Camera
                  </button>
                </div>
              ) : (
                <div className="camera-loading-placeholder">
                  <Skeleton className="w-full h-8 mb-2" />
                  <Skeleton className="w-3/4 h-4 mb-1" />
                  <Skeleton className="w-1/2 h-4" />
                </div>
              )}
            </div>
          )}
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
              <p>Base URL: {SCANNER_API_BASE_URL || "same-origin (/api)"}</p>
              <pre>{JSON.stringify(lastResponse, null, 2)}</pre>
              <button onClick={() => setDebugMode(false)}>Close</button>
            </div>
          )}
        </div>

        <div className="scanner-actions">
          <button
            type="button"
            className="camera-switch-btn"
            onClick={() => {
              void handleSwitchCamera();
            }}
            disabled={!cameraPermissionGranted}
            data-testid="switch-camera-btn"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 7h3l2-2h6l2 2h3v10h-3l-2 2H9l-2-2H4z" />
              <path d="M9 10a4 4 0 0 1 6.7-1.9" />
              <path d="M15 14a4 4 0 0 1-6.7 1.9" />
              <path d="m15.7 8.6.1 2.7-2.7.1" />
              <path d="m8.3 15.4-.1-2.7 2.7-.1" />
            </svg>
            <span>Switch Camera</span>
            <span className="camera-switch-label">{activeCameraLabel}</span>
          </button>
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
                <span className="status-secondary">
                  {scanResult.scanType === "lunch" ? "Marked lunch" : "Marked attendance"}
                  {scanResult.senderType ? ` | Type: ${scanResult.senderType}` : ""}
                </span>
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

