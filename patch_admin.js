const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/admin.ts', 'utf8');

// Check if already patched
if (content.includes('/elections/:id/stats')) {
  console.log('Already patched - stats endpoint exists');
  process.exit(0);
}

const MARKER = '\nexport default router;';
const mi = content.lastIndexOf(MARKER);
if (mi === -1) { console.error('export default not found'); process.exit(1); }

const newEndpoint = `
/**
 * @route GET /admin/elections/:id/stats
 * @desc Detailed statistics for a single election (candidates, voters, domains)
 */
router.get("/elections/:id/stats", authAdminMiddleware, async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const election = await db.get<any>(
      "SELECT id, name, description, start_time, end_time, is_active FROM elections WHERE id = ?",
      [id]
    );
    if (!election) {
      res.status(404).json({ error: "Election not found" });
      return;
    }

    const totalVotersRow = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM election_voters WHERE election_id = ?",
      [id]
    );
    const totalVotesRow = await db.get<{ count: number }>(
      "SELECT COUNT(*) as count FROM nullifier_audit WHERE election_id = ?",
      [id]
    );
    const totalVotesNum = totalVotesRow?.count || 0;
    const totalVotersNum = totalVotersRow?.count || 0;

    const candidateStats = await db.run<any>(
      \`SELECT c.id, c.name, c.description, COUNT(na.id) as votes
       FROM candidates c
       LEFT JOIN nullifier_audit na ON na.election_id = ? AND na.candidate_id = c.id
       WHERE c.election_id = ?
       GROUP BY c.id ORDER BY votes DESC\`,
      [id, id]
    );

    const candidatesWithPct = candidateStats.map((c: any) => ({
      ...c,
      percentage: totalVotesNum > 0
        ? Math.round((c.votes / totalVotesNum) * 1000) / 10
        : 0,
    }));

    const domains = await db.run<{ email_domain: string }>(
      "SELECT email_domain FROM election_access WHERE election_id = ?",
      [id]
    );

    const voters = await db.run<any>(
      \`SELECT u.email,
         CASE WHEN na.id IS NOT NULL THEN 1 ELSE 0 END as has_voted
       FROM election_voters ev
       JOIN users u ON ev.user_id = u.id
       LEFT JOIN nullifier_audit na ON na.election_id = ? AND na.user_id = u.id
       WHERE ev.election_id = ?
       ORDER BY has_voted DESC, u.email ASC\`,
      [id, id]
    );

    res.json({
      election: {
        ...election,
        startDate: new Date(election.start_time * 1000).toISOString(),
        endDate: new Date(election.end_time * 1000).toISOString(),
      },
      stats: {
        totalVoters: totalVotersNum,
        totalVotes: totalVotesNum,
        participationRate: totalVotersNum > 0
          ? Math.round((totalVotesNum / totalVotersNum) * 1000) / 10
          : 0,
      },
      candidates: candidatesWithPct,
      domains: domains.map((d: any) => d.email_domain),
      voters: voters || [],
    });
  } catch (error) {
    console.error("Error in election stats:", error);
    res.status(500).json({ error: "Error loading election stats" });
  }
});

`;

content = content.slice(0, mi) + newEndpoint + content.slice(mi);
fs.writeFileSync('backend/src/routes/admin.ts', content, 'utf8');
console.log('admin.ts patched. Length:', content.length);
