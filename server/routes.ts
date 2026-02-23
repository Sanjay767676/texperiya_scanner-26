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
    console.log(`Scanning token: ${token} (from qrData: ${qrData.substring(0, 80)})`);

    const endpoints = [
      { url: `${AZURE_BASE_URL}/scan/${encodeURIComponent(token)}`, method: "POST" as const, body: null },
      { url: `${AZURE_BASE_URL}/scan/${encodeURIComponent(token)}`, method: "GET" as const, body: null },
      { url: `${AZURE_BASE_URL}/api/scan`, method: "POST" as const, body: JSON.stringify({ qrData }) },
    ];

    for (const endpoint of endpoints) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 8000);

        const fetchOptions: RequestInit = {
          method: endpoint.method,
          signal: controller.signal,
        };
        if (endpoint.body) {
          fetchOptions.headers = { "Content-Type": "application/json" };
          fetchOptions.body = endpoint.body;
        }

        const response = await fetch(endpoint.url, fetchOptions);
        clearTimeout(timeoutId);

        const contentType = response.headers.get("content-type") || "";
        if (!contentType.includes("application/json")) {
          console.log(`Endpoint ${endpoint.method} ${endpoint.url} returned non-JSON (${contentType}), skipping`);
          continue;
        }

        const data = await response.json();
        console.log(`Endpoint ${endpoint.method} ${endpoint.url} returned:`, JSON.stringify(data));
        return res.json(data);
      } catch (err: any) {
        console.log(`Endpoint ${endpoint.method} ${endpoint.url} failed: ${err?.message}`);
        continue;
      }
    }

    console.error("All scan endpoints failed for token:", token);
    return res.status(502).json({ success: false, message: "Backend unreachable" });
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
