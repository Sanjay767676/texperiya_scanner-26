import type { Express } from "express";
import { createServer, type Server } from "http";
import axios, { AxiosError } from "axios";

const DEFAULT_TEXPERIA_API_BASE_URL =
  "https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net";

const TEXPERIA_API_BASE_URL =
  process.env.TEXPERIA_API_BASE_URL ||
  process.env.VITE_API_BASE_URL ||
  DEFAULT_TEXPERIA_API_BASE_URL;

const SCANNER_SECRET = process.env.SCANNER_SECRET || "TEX-2026-SECURE";

const upstreamApi = axios.create({
  baseURL: TEXPERIA_API_BASE_URL,
  timeout: 15000,
  headers: {
    "Content-Type": "application/json",
    "x-scanner-secret": SCANNER_SECRET,
  },
  validateStatus: () => true,
});

async function proxyScanRequest(
  endpoint: "/api/scan" | "/api/lunch",
  token: string,
  qrData: string | undefined,
) {
  try {
    const response = await upstreamApi.post(endpoint, {
      token: token.trim(),
      qrData,
    });
    return {
      statusCode: response.status,
      body: response.data,
    };
  } catch (error) {
    const upstreamError = error as AxiosError;
    const statusCode = upstreamError.response?.status ?? 502;
    const body =
      upstreamError.response?.data ||
      { message: upstreamError.code === "ECONNABORTED" ? "Request Timeout" : "Upstream unavailable" };
    return { statusCode, body };
  }
}

// Production-ready static file server only
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  console.log("[Server] Production mode - serving static files only");
  
  // Health check endpoint for monitoring
  app.get("/health", (_req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      server: "texperia-scanner-frontend"
    });
  });

  app.get("/api/health", (_req, res) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      server: "texperia-scanner-frontend",
      upstreamBaseUrl: TEXPERIA_API_BASE_URL,
    });
  });

  app.post("/api/scan", async (req, res) => {
    const token = req.body?.token;
    if (typeof token !== "string") {
      return res.status(400).json({ message: "Invalid token format" });
    }
    const result = await proxyScanRequest("/api/scan", token, req.body?.qrData);
    return res.status(result.statusCode).json(result.body);
  });

  app.post("/api/lunch", async (req, res) => {
    const token = req.body?.token;
    if (typeof token !== "string") {
      return res.status(400).json({ message: "Invalid token format" });
    }
    const result = await proxyScanRequest("/api/lunch", token, req.body?.qrData);
    return res.status(result.statusCode).json(result.body);
  });

  console.log("[Server] Routes registered for production");
  return httpServer;
}
