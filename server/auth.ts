import { Router } from "express";
import bcrypt from "bcrypt";
import { eq } from "drizzle-orm";
import { db, users } from "./db";

export const authRouter = Router();

// Login endpoint
authRouter.post("/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ 
        success: false, 
        message: "Username and password are required" 
      });
    }

    // Find user by username
    const user = await db
      .select()
      .from(users)
      .where(eq(users.username, username))
      .limit(1);

    if (user.length === 0) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid username or password" 
      });
    }

    // Check password
    const isValidPassword = await bcrypt.compare(password, user[0].password);
    
    if (!isValidPassword) {
      return res.status(401).json({ 
        success: false, 
        message: "Invalid username or password" 
      });
    }

    // Store user session
    req.session.userId = user[0].id;
    req.session.username = user[0].username;
    
    res.json({ 
      success: true, 
      message: "Login successful",
      user: { 
        id: user[0].id, 
        username: user[0].username 
      }
    });

  } catch (error) {
    console.error("Login error:", error);
    res.status(500).json({ 
      success: false, 
      message: "Internal server error" 
    });
  }
});

// Logout endpoint
authRouter.post("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ 
        success: false, 
        message: "Could not log out" 
      });
    }
    res.json({ 
      success: true, 
      message: "Logout successful" 
    });
  });
});

// Check session endpoint
authRouter.get("/me", (req, res) => {
  if (req.session.userId) {
    res.json({ 
      success: true, 
      user: { 
        id: req.session.userId, 
        username: req.session.username 
      }
    });
  } else {
    res.status(401).json({ 
      success: false, 
      message: "Not authenticated" 
    });
  }
});

// Middleware to check authentication
export const requireAuth = (req: any, res: any, next: any) => {
  if (req.session.userId) {
    next();
  } else {
    res.status(401).json({ 
      success: false, 
      message: "Authentication required" 
    });
  }
};