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

    const token = extractToken(qrData);
    console.log(`Scanning token: ${token}`);

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 12000);

      const response = await fetch(`${AZURE_BASE_URL}/scan`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
        signal: controller.signal,
      });
      clearTimeout(timeoutId);

      const contentType = response.headers.get("content-type") || "";
      if (!contentType.includes("application/json")) {
        console.error("Backend returned non-JSON:", contentType);
        return res.status(502).json({ success: false, message: "Backend error" });
      }

      const data = await response.json();
      console.log("Backend response:", JSON.stringify(data));
      return res.json(data);
    } catch (err: any) {
      const msg = err.name === "AbortError" ? "Backend timeout" : "Backend unreachable";
      console.error("Scan proxy error:", err?.message);
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
  } catch (_) {}
  const queryMatch = trimmed.match(/[?&]token=([^\s&#]+)/);
  if (queryMatch) return queryMatch[1];
  const pathMatch = trimmed.match(/\/scan\/([^\s?#]+)/);
  if (pathMatch) return pathMatch[1].replace(/\/+$/, "");
  return trimmed;
}
