import { ethers } from "ethers";
import dotenv from "dotenv";
import { getDatabase } from "../config/database.js";

dotenv.config({ quiet: true });

const CONTRACT_ABI = [
  "function createElection(string memory _name, uint256 _startTime, uint256 _endTime) external",
  "function electionCount() view returns (uint256)",
  "function getElection(uint256 _id) public view returns (string, uint256, uint256, bool, uint256)",
];

type ElectionRow = {
  id: number;
  election_id_blockchain: number;
  name: string;
  start_time: number;
  end_time: number;
  is_active: number;
};

export async function syncElectionsToBlockchain(): Promise<void> {
  const contractAddress = process.env.CONTRACT_ADDRESS || "";
  const privateKey = process.env.PRIVATE_KEY || "";
  const rpcUrl = process.env.RPC_URL || "";

  if (!contractAddress || !privateKey || !rpcUrl) {
    console.log("Blockchain not configured - skipping election sync");
    return;
  }

  const db = getDatabase();

  try {
    console.log("Syncing elections to blockchain...");

    const provider = new ethers.JsonRpcProvider(rpcUrl);
    const wallet = new ethers.Wallet(privateKey, provider);
    const contract = new ethers.Contract(contractAddress, CONTRACT_ABI, wallet);

    let onChainCount = Number(await contract.electionCount());
    console.log(`On-chain elections: ${onChainCount}`);

    const elections = await db.run<ElectionRow>(
      "SELECT id, election_id_blockchain, name, start_time, end_time, is_active FROM elections ORDER BY election_id_blockchain ASC"
    );

    console.log(`SQLite elections: ${elections.length}`);

    if (elections.length === 0) {
      console.log("No elections in SQLite - nothing to sync");
      return;
    }

    for (let i = 0; i < elections.length; i++) {
      const expectedId = i + 1;
      if (elections[i].election_id_blockchain !== expectedId) {
        await db.exec(
          "UPDATE elections SET election_id_blockchain = ? WHERE id = ?",
          [expectedId, elections[i].id]
        );
        elections[i].election_id_blockchain = expectedId;
        console.log(`  Fixed election "${elections[i].name}" blockchain ID -> ${expectedId}`);
      }
    }

    const now = Math.floor(Date.now() / 1000);
    let created = 0;
    let skipped = 0;

    for (const election of elections) {
      const targetId = election.election_id_blockchain;

      if (targetId <= onChainCount) {
        skipped++;
        continue;
      }

      const safeStart = Math.max(election.start_time, now + 120);
      const safeEnd = Math.max(election.end_time, now + 3600 * 24 * 30);

      console.log(`  Creating on-chain: "${election.name}" (ID ${targetId})`);

      try {
        const tx = await contract.createElection(election.name, safeStart, safeEnd, {
          gasLimit: 300000,
        });
        const receipt = await tx.wait();
        console.log(`  Created: txHash ${tx.hash} (block ${receipt?.blockNumber})`);
        created++;
        onChainCount++;

        await new Promise(resolve => setTimeout(resolve, 2000));
      } catch (err: any) {
        console.error(`  Failed to create "${election.name}": ${err.message}`);
      }
    }

    const finalCount = Number(await contract.electionCount());
    console.log(`Sync complete: ${created} created, ${skipped} already existed`);
    console.log(`Final on-chain count: ${finalCount}`);
  } catch (err: any) {
    console.error("Election sync failed (non-fatal):", err.message);
  }
}

const isMain = process.argv[1]?.includes("syncElections");
if (isMain) {
  getDatabase()
    .initialize()
    .then(() => syncElectionsToBlockchain())
    .catch((err: any) => {
      console.error("Election sync failed:", err.message);
      process.exitCode = 1;
    });
}
