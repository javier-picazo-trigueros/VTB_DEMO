import express, { Request, Response } from "express";
import { getDatabase } from "../config/database.js";
import { hashPassword } from "../utils/auth.js";

const router = express.Router();
const db = getDatabase();

/**
 * @route POST /registration/request
 * @desc Public endpoint - user submits a registration request with their chosen password
 * @body { fullName, email, studentId, password }
 */
router.post("/request", async (req: Request, res: Response) => {
  try {
    const fullName = req.body.fullName || req.body.name;
    const email = req.body.email;
    const studentId = req.body.studentId || req.body.student_id;
    const password = req.body.password;

    // Validate required fields
    if (!fullName?.trim() || !email?.trim() || !studentId?.trim() || !password?.trim()) {
      res.status(400).json({
        error: "All fields are required: full name, email, student ID, and password",
      });
      return;
    }

    // Validate email format
    if (!email.includes("@") || !email.includes(".")) {
      res.status(400).json({ error: "Invalid email format" });
      return;
    }

    // Validate password length
    if (password.length < 6) {
      res.status(400).json({ error: "Password must be at least 6 characters" });
      return;
    }

    // Check email doesn't already exist in users
    const existingUser = await db.get<{ id: number }>(
      "SELECT id FROM users WHERE email = ?",
      [email]
    );
    if (existingUser) {
      res.status(409).json({ error: "This email already has an active account" });
      return;
    }

    // Check no pending request exists for this email
    const existingRequest = await db.get<{ id: number }>(
      "SELECT id FROM registration_requests WHERE email = ? AND status = 'pending'",
      [email]
    );
    if (existingRequest) {
      res.status(409).json({ error: "You already have a pending registration request" });
      return;
    }

    // Hash the password and store it with the request
    const passwordHash = await hashPassword(password);

    await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, password_hash, status, created_at)
       VALUES (?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
      [fullName, email, studentId, passwordHash]
    );

    res.json({
      message: "Registration request submitted successfully. An administrator will review it shortly.",
    });
  } catch (error) {
    console.error("Error in registration request:", error);
    res.status(500).json({ error: "Error processing registration request" });
  }
});

export default router;
