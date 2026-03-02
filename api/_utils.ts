import axios, { AxiosError } from "axios";

const DEFAULT_TEXPERIA_API_BASE_URL =
  "https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net";

function getConfig() {
  return {
    baseURL:
      process.env.TEXPERIA_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      DEFAULT_TEXPERIA_API_BASE_URL,
    scannerSecret: process.env.SCANNER_SECRET || "TEX-2026-SECURE",
  };
}

export function sendMethodNotAllowed(res: any) {
  return res.status(405).json({ message: "Method Not Allowed" });
}

export async function proxyScan(endpoint: "/api/scan" | "/api/lunch", token: string, qrData?: string) {
  const { baseURL, scannerSecret } = getConfig();
  const upstreamApi = axios.create({
    baseURL,
    timeout: 15000,
    headers: {
      "Content-Type": "application/json",
      "x-scanner-secret": scannerSecret,
    },
    validateStatus: () => true,
  });

  try {
    const response = await upstreamApi.post(endpoint, {
      token: token.trim(),
      qrData,
    });
    return { statusCode: response.status, body: response.data };
  } catch (error) {
    const upstreamError = error as AxiosError;
    const statusCode = upstreamError.response?.status ?? 502;
    const body =
      upstreamError.response?.data ||
      { message: upstreamError.code === "ECONNABORTED" ? "Request Timeout" : "Upstream unavailable" };
    return { statusCode, body };
  }
}

export function healthPayload() {
  const { baseURL } = getConfig();
  return {
    status: "ok",
    timestamp: new Date().toISOString(),
    server: "texperia-scanner-vercel-api",
    upstreamBaseUrl: baseURL,
  };
}

