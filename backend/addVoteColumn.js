const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = path.join(__dirname, 'vtb.db');
const db = new sqlite3.Database(dbPath);

db.run("PRAGMA foreign_keys = ON");

// Check if column exists
db.all("PRAGMA table_info(nullifier_audit)", (err, rows) => {
  if (err) {
    console.error("❌ Error checking table:", err);
    db.close();
    return;
  }

  const hasVoteChoice = rows.some(row => row.name === 'vote_choice');
  
  if (hasVoteChoice) {
    console.log("✅ Column vote_choice already exists");
    db.close();
    return;
  }

  // Add column
  db.run("ALTER TABLE nullifier_audit ADD COLUMN vote_choice TEXT DEFAULT NULL", function(err) {
    if (err) {
      console.error("❌ Error adding column:", err);
      db.close();
      return;
    }
    console.log("✅ Successfully added vote_choice column");
    db.close();
  });
});
