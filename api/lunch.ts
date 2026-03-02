import { proxyScan, sendMethodNotAllowed } from "./_utils";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return sendMethodNotAllowed(res);
  }

  const token = req.body?.token;
  if (typeof token !== "string" || token.trim().length === 0) {
    return res.status(400).json({ message: "Invalid token format" });
  }

  const result = await proxyScan("/api/lunch", token, req.body?.qrData);
  return res.status(result.statusCode).json(result.body);
}

