import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

const AZURE_BASE_URL = process.env.VITE_API_BASE_URL || process.env.VITE_BASE_URL || "https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.get("/api/health", async (_req, res) => {
    try {
      console.log(`[Proxy] Checking backend health: ${AZURE_BASE_URL}`);
      // Try /health first, then fallback to root / if needed
      let response = await fetch(`${AZURE_BASE_URL}/health`, {
        signal: AbortSignal.timeout(10000)
      }).catch(() => null);

      if (!response || !response.ok) {
        console.log("[Proxy] /health failed or 404, trying root /");
        response = await fetch(`${AZURE_BASE_URL}/`, {
          signal: AbortSignal.timeout(10000)
        }).catch(() => null);
      }

      if (response) {
        console.log(`[Proxy] Backend responded with status: ${response.status}`);
        return res.json({ status: "ok", backend: "connected", azureStatus: response.status });
      }

      return res.status(503).json({ status: "error", backend: "unreachable" });
    } catch (err: any) {
      console.error(`[Proxy] Health check failed: ${err.message}`);
      return res.status(503).json({ status: "error", backend: "error" });
    }
  });

  app.post("/api/scan", async (req, res) => {
    const { qrData, token: incomingToken } = req.body;

    // Support both direct token or qrData extraction
    const token = incomingToken || extractToken(qrData || "");

    if (!token) {
      return res.status(400).json({ success: false, message: "Missing token or qrData" });
    }

    console.log(`Scanning token: ${token}`);

    try {
      const response = await fetch(`${AZURE_BASE_URL}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(15000), // Increased to 15s
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.error("Backend returned non-JSON:", contentType);
        return res.status(502).json({ success: false, message: "Backend error" });
      }

      const data = await response.json();
      console.log("Backend response:", JSON.stringify(data));

      // Pass through the status code from backend (especially 409 for already scanned)
      return res.status(response.status).json(data);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Backend timeout" : "Backend unreachable";
      console.error("Scan proxy error:", err?.message);
      return res.status(502).json({ success: false, message: msg });
    }
  });

  app.post("/api/lunch", async (req, res) => {
    const { qrData, token: incomingToken } = req.body;

    // Support both direct token or qrData extraction
    const token = incomingToken || extractToken(qrData || "");

    if (!token) {
      return res.status(400).json({ success: false, message: "Missing token or qrData" });
    }

    console.log(`Processing lunch token: ${token}`);

    try {
      const response = await fetch(`${AZURE_BASE_URL}/lunch`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: AbortSignal.timeout(15000),
      });

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.error("Backend returned non-JSON:", contentType);
        return res.status(502).json({ success: false, message: "Backend error" });
      }

      const data = await response.json();
      console.log("Backend lunch response:", JSON.stringify(data));

      // Pass through the status code from backend
      return res.status(response.status).json(data);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Backend timeout" : "Backend unreachable";
      console.error("Lunch proxy error:", err?.message);
      return res.status(502).json({ success: false, message: msg });
    }
  });

  return httpServer;
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
