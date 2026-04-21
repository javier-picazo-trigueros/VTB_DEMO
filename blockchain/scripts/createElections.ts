import { ethers } from "hardhat";

async function main() {
  const CONTRACT_ADDRESS = "0xF6909eaF37D33b51333a282c4b3750981Bc768a4";
  const abi = [
    "function createElection(string memory _name, uint256 _startTime, uint256 _endTime) external",
    "function electionCount() view returns (uint256)"
  ];

  const [deployer] = await ethers.getSigners();
  const contract = new ethers.Contract(CONTRACT_ADDRESS, abi, deployer);

  // Check how many already exist
  const existing = Number(await contract.electionCount());
  console.log(`Elections already on-chain: ${existing}`);

  const now = Math.floor(Date.now() / 1000);
  const start = now + 3600;           // starts in 1 hour (safe margin)
  const end = now + 365 * 24 * 3600;  // ends in 1 year

  const total = 20;
  console.log(`Creating elections ${existing + 1} to ${total}...`);

  for (let i = existing + 1; i <= total; i++) {
    const tx = await contract.createElection(`Election ${i}`, start, end);
    await tx.wait();
    console.log(`✓ Election ${i} — tx: ${tx.hash}`);
  }

  const count = Number(await contract.electionCount());
  console.log(`\nTotal elections on-chain: ${count}`);
}

main().catch(console.error);