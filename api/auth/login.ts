import { readJsonBody, setSessionCookie } from "./_session";

export default async function handler(req: any, res: any) {
  try {
    if (req.method !== "POST") {
      return res.status(405).json({ success: false, message: "Method Not Allowed" });
    }

    // Check if DATABASE_URL exists
    if (!process.env.DATABASE_URL) {
      console.error("DATABASE_URL environment variable is missing");
      return res.status(500).json({ 
        success: false, 
        message: "Database configuration error",
      });
    }

    const body = readJsonBody(req);
    const username = String(body?.username || "").trim();
    const password = String(body?.password || "");

    if (!username || !password) {
      return res.status(400).json({
        success: false,
        message: "Username and password are required",
      });
    }

    try {
      const [{ db, users }, { eq }, bcryptModule] = await Promise.all([
        import("../../server/db"),
        import("drizzle-orm"),
        import("bcrypt"),
      ]);

      const userRows = await db
        .select()
        .from(users)
        .where(eq(users.username, username))
        .limit(1);

      if (userRows.length === 0) {
        return res.status(401).json({ success: false, message: "Invalid username or password" });
      }

      const dbUser = userRows[0];
      const isValidPassword = await bcryptModule.default.compare(password, dbUser.password);

      if (!isValidPassword) {
        return res.status(401).json({ success: false, message: "Invalid username or password" });
      }

      const user = { id: dbUser.id, username: dbUser.username };
      setSessionCookie(res, user);

      return res.status(200).json({
        success: true,
        message: "Login successful",
        user,
      });
    } catch (dbError) {
      console.error("Database error:", dbError);
      return res.status(500).json({ 
        success: false, 
        message: "Database connection error",
      });
    }
  } catch (error: any) {
    const message =
      error?.message === "DATABASE_URL environment variable is required"
        ? "Server configuration error: DATABASE_URL is missing"
        : "Internal server error";
    return res.status(500).json({ success: false, message });
  }
}

