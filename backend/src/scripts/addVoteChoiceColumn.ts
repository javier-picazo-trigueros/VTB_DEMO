/**
 * Migration: Add vote_choice column to nullifier_audit table
 * Allows storing which candidate each vote was for
 */

import { getDatabase } from "../config/database.js";

async function runMigration() {
  const db = getDatabase();

  try {
    console.log("🔄 Running migration: Adding vote_choice column...");

    // Check if column already exists
    const info = await db.run<any>(
      "PRAGMA table_info(nullifier_audit)"
    );

    const hasVoteChoice = info?.some((col: any) => col.name === "vote_choice");

    if (hasVoteChoice) {
      console.log("✅ Column vote_choice already exists. Skipping migration.");
      return;
    }

    // Add the column
    await db.exec(
      `ALTER TABLE nullifier_audit ADD COLUMN vote_choice TEXT DEFAULT NULL`
    );

    console.log("✅ Successfully added vote_choice column to nullifier_audit");
  } catch (error) {
    console.error("❌ Migration failed:", error);
    throw error;
  }
}

runMigration().then(() => {
  console.log("✨ Migration complete");
  process.exit(0);
}).catch(() => {
  process.exit(1);
});
