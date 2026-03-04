import { clearSessionCookie } from "./_session";

export default async function handler(req: any, res: any) {
  if (req.method !== "POST") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  clearSessionCookie(res);
  return res.status(200).json({ success: true, message: "Logout successful" });
}

