import { getDatabase } from "./src/config/database.js";
import { hashPassword } from "./src/utils/auth.js";

async function fixDb() {
  const db = getDatabase();
  await db.initialize();
  
  console.log("Fixing admins...");
  await db.exec("UPDATE users SET admin_domain = 'ufv.es' WHERE email = 'admin@ufv.es'");
  await db.exec("UPDATE users SET admin_domain = 'universidad.edu' WHERE email = 'admin@universidad.edu'");
  
  console.log("Fixing juan@universidad.edu password...");
  const pwd = await hashPassword('password123');
  await db.exec(`UPDATE users SET password_hash = '${pwd}' WHERE email = 'juan@universidad.edu'`);

  console.log("Adding required 10 students per domain...");
  const usersToInsert = [];
  
  // 10 ufv
  for (let i = 1; i <= 10; i++) {
    usersToInsert.push({
      email: `student${i}@ufv.es`,
      name: `Student UFV ${i}`,
      student_id: `UFV-STU-${i}`,
      password: "demo123",
      role: "student",
      admin_domain: null
    });
  }

  // 10 edu
  for (let i = 1; i <= 10; i++) {
    usersToInsert.push({
      email: `student${i}@universidad.edu`,
      name: `Student EDU ${i}`,
      student_id: `EDU-STU-${i}`,
      password: "demo123",
      role: "student",
      admin_domain: null
    });
  }

  for (const user of usersToInsert) {
    try {
      const hash = await hashPassword(user.password);
      await db.exec(
        `INSERT INTO users (email, password_hash, name, student_id, role, admin_domain, is_eligible)
         VALUES (?, ?, ?, ?, ?, ?, 1)`,
        [user.email, hash, user.name, user.student_id, user.role, user.admin_domain]
      );
      console.log(`Added ${user.email}`);
    } catch (e) {
      // ignore
      console.log(`Skipped ${user.email}`);
    }
  }

  // Make sure they are assigned to their respective elections!
  console.log("Assigning users to elections...");
  const Ufvs = await db.run("SELECT id FROM users WHERE email LIKE '%@ufv.es' AND role='student'");
  const Edus = await db.run("SELECT id FROM users WHERE email LIKE '%@universidad.edu' AND role='student'");

  const elections = await db.run("SELECT id FROM elections");
  for (const election of (elections || [])) {
    const domains = await db.run("SELECT email_domain FROM election_access WHERE election_id = ?", [election.id]);
    const domainList = (domains || []).map((d: any) => d.email_domain);

    let usersToAssign = [];
    if (domainList.includes("ufv.es")) {
      usersToAssign = usersToAssign.concat(Ufvs || []);
    }
    if (domainList.includes("universidad.edu")) {
      usersToAssign = usersToAssign.concat(Edus || []);
    }

    for (const u of usersToAssign) {
      try {
        await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [election.id, u.id]);
      } catch (e) {
        // limit logs
      }
    }
  }

  console.log("Done");
}

fixDb().catch(console.error);
