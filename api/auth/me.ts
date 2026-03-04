import { getSessionUser } from "./_session";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return res.status(405).json({ success: false, message: "Method Not Allowed" });
  }

  const user = getSessionUser(req);
  if (!user) {
    return res.status(401).json({ success: false, message: "Not authenticated" });
  }

  return res.status(200).json({ success: true, user });
}

