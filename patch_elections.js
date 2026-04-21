const fs = require('fs');
let content = fs.readFileSync('backend/src/routes/elections.ts', 'utf8');

const START = '    // Obtener votos del blockchain';
const END = '    participationRate: Math.round(participationRate * 10) / 10,\r\n    });\r\n\r\n  } catch (error) {\r\n    console.error("Error al obtener resultados:", error);';

const si = content.indexOf(START);
const ei = content.indexOf(END);
if (si === -1 || ei === -1) { console.error('NOT FOUND si='+si+' ei='+ei); process.exit(1); }
const eiFull = ei + END.length;

const replacement = `    // Get real per-candidate vote counts from candidate_id column
    const candidateVoteCounts = await db.run<{ candidate_id: number; votes: number }>(
      \`SELECT candidate_id, COUNT(*) as votes
       FROM nullifier_audit
       WHERE election_id = ? AND candidate_id IS NOT NULL
       GROUP BY candidate_id\`,
      [election.id]
    );

    const voteMap: Record<number, number> = {};
    for (const cv of candidateVoteCounts) {
      voteMap[cv.candidate_id] = cv.votes;
    }

    const candidatesWithVotes = candidates.map(c => ({
      id: c.id,
      name: c.name,
      description: c.description || '',
      votes: voteMap[c.id] || 0,
      percentage: 0,
    }));

    const realTotalVotes = candidatesWithVotes.reduce((s, c) => s + c.votes, 0);
    candidatesWithVotes.forEach(c => {
      c.percentage = realTotalVotes > 0
        ? Math.round((c.votes / realTotalVotes) * 1000) / 10
        : 0;
    });
    candidatesWithVotes.sort((a, b) => b.votes - a.votes);

    const totalVoterCount = voterCount?.count || 0;
    const onChainCount = await db.get<{ count: number }>(
      'SELECT COUNT(*) as count FROM nullifier_audit WHERE election_id = ? AND tx_hash IS NOT NULL',
      [election.id]
    );

    res.json({
      election: {
        id: election.id,
        name: election.name,
        description: election.description || '',
        status,
        startDate: new Date(election.start_time * 1000).toISOString(),
        endDate: new Date(election.end_time * 1000).toISOString(),
        totalVoters: totalVoterCount,
      },
      candidates: candidatesWithVotes,
      totalVotes: realTotalVotes,
      participationRate: totalVoterCount > 0
        ? Math.round((realTotalVotes / totalVoterCount) * 1000) / 10
        : 0,
      onChainVerified: (onChainCount?.count || 0) > 0,
    });

  } catch (error) {
    console.error("Error al obtener resultados:", error);`;

content = content.slice(0, si) + replacement + content.slice(eiFull);
fs.writeFileSync('backend/src/routes/elections.ts', content, 'utf8');
console.log('elections.ts patched. Length:', content.length);
