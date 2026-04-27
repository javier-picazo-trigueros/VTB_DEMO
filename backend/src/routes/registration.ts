import express, { Request, Response } from "express";
import { getDatabase } from "../config/database.js";
import { hashPassword } from "../utils/auth.js";
import { emailService } from "../services/emailService.js";

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
    const orgUnit: string | null = req.body.orgUnit || req.body.org_unit || null;

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

    // Check if email is whitelisted for auto-approve
    const emailDomain = email.split('@')[1];
    const whitelisted = await db.get<any>(
      `SELECT * FROM email_whitelist WHERE email = ? AND (admin_domain = ? OR admin_domain = '*') AND used = 0`,
      [email.toLowerCase(), emailDomain]
    );

    if (whitelisted) {
      const autoHash = await hashPassword(password);
      try {
        await db.exec(
          `INSERT INTO users (email, password_hash, name, student_id, role, org_unit, is_approved, is_eligible, created_at)
           VALUES (?, ?, ?, ?, 'student', ?, 1, 1, CURRENT_TIMESTAMP)`,
          [email, autoHash, whitelisted.full_name || fullName, whitelisted.student_id || studentId, orgUnit]
        );
      } catch (insertErr: any) {
        if (insertErr.message?.includes('UNIQUE')) {
          res.status(409).json({ error: "This email already has an active account" });
          return;
        }
        throw insertErr;
      }

      await db.exec("UPDATE email_whitelist SET used = 1 WHERE id = ?", [whitelisted.id]);

      const elections = await db.run<{ election_id: number }>(
        "SELECT election_id FROM election_access WHERE email_domain = ? OR email_domain = '*'",
        [emailDomain]
      );
      const newUser = await db.get<{ id: number }>("SELECT id FROM users WHERE email = ?", [email]);
      if (newUser) {
        for (const elec of elections) {
          await db.exec(
            "INSERT OR IGNORE INTO election_voters (election_id, user_id) VALUES (?, ?)",
            [elec.election_id, newUser.id]
          ).catch(() => {});
        }
      }

      res.status(201).json({
        message: "Your account has been automatically approved! You can log in now with the password you chose.",
        autoApproved: true,
      });
      return;
    }

    // Not whitelisted — normal pending flow
    const passwordHash = await hashPassword(password);

    await db.exec(
      `INSERT INTO registration_requests (full_name, email, student_id, org_unit, password_hash, status, created_at)
       VALUES (?, ?, ?, ?, ?, 'pending', CURRENT_TIMESTAMP)`,
      [fullName, email, studentId, orgUnit, passwordHash]
    );

    // Send confirmation to user (best-effort)
    emailService.sendRegistrationReceived(email, fullName).catch(err =>
      console.error('[EMAIL ERROR] registration received:', err.message)
    );

    // Notify admins for this domain (best-effort)
    const domain = email.split('@')[1];
    try {
      const admins = await db.run<{ email: string; name: string }>(
        `SELECT email, name FROM users
         WHERE role IN ('admin','superadmin')
         AND (admin_domain = ? OR role = 'superadmin')
         LIMIT 5`,
        [domain]
      );
      for (const admin of (admins || [])) {
        emailService.sendAdminNewRequest(
          admin.email, fullName, email, studentId
        ).catch(err =>
          console.error('[EMAIL ERROR] admin notify:', err.message)
        );
      }
    } catch (e) {
      console.error('[EMAIL ERROR] finding admins:', e);
    }

    res.json({
      message: "Registration request submitted successfully. An administrator will review it shortly.",
    });
  } catch (error) {
    console.error("Error in registration request:", error);
    res.status(500).json({ error: "Error processing registration request" });
  }
});

export default router;
