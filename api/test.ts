export default async function handler(req: any, res: any) {
  try {
    return res.status(200).json({
      success: true,
      message: "API is working",
      env: {
        hasDbUrl: !!process.env.DATABASE_URL,
        nodeEnv: process.env.NODE_ENV,
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