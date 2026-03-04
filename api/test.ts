export default async function handler(req: any, res: any) {
  try {
    // Test database connection
    let dbStatus = "not tested";
    let dbError = null;
    
    try {
      if (process.env.DATABASE_URL) {
        const [{ db, users }, { eq }] = await Promise.all([
          import("../server/db"),
          import("drizzle-orm"),
        ]);
        
        // Test a simple query
        const testQuery = await db.select().from(users).limit(1);
        dbStatus = `connected - found ${testQuery.length} user(s)`;
      } else {
        dbStatus = "DATABASE_URL missing";
      }
    } catch (error) {
      dbStatus = "connection failed";
      dbError = String(error);
    }

    return res.status(200).json({
      success: true,
      message: "API is working",
      env: {
        hasDbUrl: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV,
        dbStatus,
        dbError,
      }
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Error in test endpoint",
      error: String(error)
    });
  }
}