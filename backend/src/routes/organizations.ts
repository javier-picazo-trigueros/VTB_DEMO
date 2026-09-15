import { Router, Request, Response } from "express";
import { getDbClient } from "../db/index.js";

/**
 * @title Organizations Router - VTB Backend
 * @dev Public endpoint for multi-tenant institutional portal lookups.
 *
 * GET /api/organizations/:domain
 *   Returns branding data (name, logo_url, primary_color) for the given
 *   institutional domain.  Used by the InstitutionPortal frontend page.
 */

const router = Router();

router.get("/:domain", async (req: Request, res: Response): Promise<void> => {
  const { domain } = req.params;

  if (!domain || domain.trim() === "") {
    res.status(400).json({ error: "Falta el parámetro de dominio" });
    return;
  }

  try {
    const db = getDbClient();
    const org = await db.get<{
      name: string;
      logo_url: string | null;
      primary_color: string | null;
    }>(
      `SELECT name, logo_url, primary_color FROM org_units WHERE domain = ? LIMIT 1`,
      [domain.toLowerCase().trim()]
    );

    if (!org) {
      res.status(404).json({ error: "Institución no encontrada" });
      return;
    }

    res.json({
      name: org.name,
      logo_url: org.logo_url,
      primary_color: org.primary_color,
    });
  } catch (error) {
    console.error("Error fetching organization by domain:", error);
    res.status(500).json({ error: "Error interno del servidor" });
  }
});

export default router;
