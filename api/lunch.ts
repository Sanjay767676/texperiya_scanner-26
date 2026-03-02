export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ message: "Method Not Allowed" });
    }

    const token = req.body?.token;
    if (typeof token !== "string" || token.trim().length === 0) {
      return res.status(400).json({ message: "Invalid token format" });
    }

    const { default: axios } = await import("axios");
    const baseURL =
      process.env.TEXPERIA_API_BASE_URL ||
      process.env.VITE_API_BASE_URL ||
      "https://texperia-backend-anbub8brccgzfzd9.southindia-01.azurewebsites.net";
    const scannerSecret = process.env.SCANNER_SECRET || "TEX-2026-SECURE";

    const upstreamApi = axios.create({
      baseURL,
      timeout: 15000,
      headers: {
        "Content-Type": "application/json",
        "x-scanner-secret": scannerSecret,
      },
      validateStatus: () => true,
    });

    const response = await upstreamApi.post("/api/lunch", {
      token: token.trim(),
      qrData: req.body?.qrData,
    });
    return res.status(response.status).json(response.data);
  } catch (error: any) {
    const statusCode = error?.response?.status ?? 502;
    const body =
      error?.response?.data ||
      { message: error?.code === "ECONNABORTED" ? "Request Timeout" : "Upstream unavailable" };
    return res.status(statusCode).json(body);
  }
}
