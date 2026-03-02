import { healthPayload, sendMethodNotAllowed } from "./_utils";

export default async function handler(req: any, res: any) {
  if (req.method !== "GET") {
    return sendMethodNotAllowed(res);
  }

  return res.status(200).json(healthPayload());
}

