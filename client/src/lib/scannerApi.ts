import axios, { AxiosError } from "axios";

export type ScannerMode = "attendance" | "lunch";
export type SenderType = "CS" | "NCS";

export interface ScanPayload {
  token: string;
  qrData?: string;
}

export interface ScanSuccessData {
  scanType: ScannerMode;
  senderType: SenderType;
  rowIndex: number;
}

interface ScannerApiResponse {
  status?: string;
  message?: string;
  data?: ScanSuccessData;
}

export type ScanUiStatus =
  | "success"
  | "already_marked"
  | "invalid_qr"
  | "wrong_mode"
  | "unauthorized"
  | "error";

export interface ScanUiResult {
  status: ScanUiStatus;
  httpStatus: number;
  message: string;
  data?: ScanSuccessData;
}

export const SCANNER_API_BASE_URL =
  import.meta.env.VITE_API_BASE_URL || "";

const scannerApi = axios.create({
  baseURL: SCANNER_API_BASE_URL,
  timeout: 15000,
  headers: { "Content-Type": "application/json" },
  validateStatus: () => true,
});

function mapResult(httpStatus: number, body: ScannerApiResponse): ScanUiResult {
  const message = body?.message || "Unexpected response";

  if (httpStatus === 200) {
    return {
      status: "success",
      httpStatus,
      message,
      data: body.data,
    };
  }

  if (httpStatus === 409) {
    return {
      status: "already_marked",
      httpStatus,
      message: message || "Already marked",
    };
  }

  if (httpStatus === 403) {
    return {
      status: "unauthorized",
      httpStatus,
      message: message || "Unauthorized scanner request",
    };
  }

  if (httpStatus === 400) {
    const lowered = message.toLowerCase();
    if (lowered.includes("invalid token format")) {
      return { status: "invalid_qr", httpStatus, message };
    }
    if (lowered.includes("this qr is for")) {
      return { status: "wrong_mode", httpStatus, message };
    }
    return { status: "error", httpStatus, message };
  }

  return { status: "error", httpStatus, message };
}

export async function submitScan(mode: ScannerMode, payload: ScanPayload): Promise<ScanUiResult> {
  const endpoint = mode === "lunch" ? "/api/lunch" : "/api/scan";

  try {
    const response = await scannerApi.post<ScannerApiResponse>(endpoint, payload);
    return mapResult(response.status, response.data || {});
  } catch (error) {
    const axiosError = error as AxiosError<ScannerApiResponse>;
    const message =
      axiosError.response?.data?.message ||
      (axiosError.code === "ECONNABORTED" ? "Request Timeout" : "Network Error");
    const status = axiosError.response?.status ?? 0;

    return {
      status: "error",
      httpStatus: status,
      message,
    };
  }
}

export async function checkScannerHealth(): Promise<boolean> {
  try {
    const response = await scannerApi.get("/api/health");
    return response.status >= 200 && response.status < 300;
  } catch (_) {
    return false;
  }
}
