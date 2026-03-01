import type { Express } from "express";
import { createServer, type Server } from "http";

// Production-ready static file server only
export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {

  console.log("[Server] Production mode - serving static files only");
  
  // Health check endpoint for monitoring
  app.get("/health", (req, res) => {
    res.json({ 
      status: "ok", 
      timestamp: new Date().toISOString(),
      server: "texperia-scanner-frontend"
    });
  });

  console.log("[Server] Routes registered for production");
  return httpServer;
}
