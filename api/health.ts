export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "GET") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }

    const baseURL =
      process.env.TEXPERIA_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      "https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net";

    return res.status(200).json({
      status: "ok",
      timestamp: new Date().toISOString(),
      server: "texperia-scanner-vercel-api",
      upstreamBaseUrl: baseURL,
    });
  } catch (error: any) {
    return res.status(500).json({
      status: "error",
      message: error?.message || "health handler failed",
    });
  }
}
