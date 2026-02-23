import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";

const AZURE_BASE_URL = process.env.VITE_BASE_URL || "https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net";

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  app.post("/api/scan", async (req, res) => {
    const { qrData } = req.body;
    if (!qrData) {
      return res.status(400).json({ success: false, message: "Missing qrData" });
    }

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${AZURE_BASE_URL}/api/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ qrData }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      return res.json(data);
    } catch (primaryErr: any) {
      try {
        const token = extractToken(qrData);
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 8000);

        const fallback = await fetch(`${AZURE_BASE_URL}/scan/${encodeURIComponent(token)}`, {
          method: "POST",
          signal: controller2.signal,
        });
        clearTimeout(timeoutId2);

        const data = await fallback.json();
        return res.json(data);
      } catch (fallbackErr: any) {
        console.error("Scan proxy error:", primaryErr?.message, fallbackErr?.message);
        return res.status(502).json({ success: false, message: "Backend unreachable" });
      }
    }
  });

  app.post("/api/scan-token/:token", async (req, res) => {
    const { token } = req.params;
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 8000);

      const response = await fetch(`${AZURE_BASE_URL}/scan/${encodeURIComponent(token)}`, {
        method: "POST",
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const data = await response.json();
      return res.json(data);
    } catch (err: any) {
      console.error("Token scan proxy error:", err?.message);
      return res.status(502).json({ success: false, message: "Backend unreachable" });
    }
  });

  return httpServer;
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
