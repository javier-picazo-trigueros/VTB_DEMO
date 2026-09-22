/**
 * Test para Punto 17:
 * Comprueba que el backend no expone rpcUrl, err.message ni blockchainError.message
 * al cliente en /admin/blockchain-status y /api/elections/register-vote, ya que
 * pueden contener la URL del RPC con API keys privadas de Alchemy/Infura.
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import { app } from '../app.js';
import { getDbClient } from '../db/index.js';
import { createFixtureUser, createFixtureElection, loginAsFixture } from './helpers/fixtures.js';
import { setVotePortForTesting, type VotePort } from '../services/voteChain.js';

const db = getDbClient();
const SECRET_RPC_KEY = 'super_secret_alchemy_key_xyz987';
const RPC_WITH_KEY = `https://eth-sepolia.g.alchemy.com/v2/${SECRET_RPC_KEY}`;

afterEach(() => {
  setVotePortForTesting(null);
  vi.restoreAllMocks();
});

describe('Punto 17: No devolver rpcUrl ni mensajes de error de blockchain que filtren credenciales', () => {
  describe('GET /admin/blockchain-status', () => {
    it('no incluye la propiedad rpcUrl en la respuesta JSON', async () => {
      const admin = await createFixtureUser({ role: 'admin', adminDomain: 'vtb.demo' });
      const { agent } = await loginAsFixture(admin.email, admin.password);

      const res = await agent.get('/admin/blockchain-status');
      expect(res.status).toBe(200);
      expect(res.body.rpcUrl).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain('rpcUrl');
    });

    it('no filtra el mensaje de error original con credenciales cuando falla la conexión', async () => {
      const origRpc = process.env.RPC_URL;
      const origContract = process.env.CONTRACT_ADDRESS;
      try {
        process.env.RPC_URL = RPC_WITH_KEY;
        process.env.CONTRACT_ADDRESS = '0x1111111111111111111111111111111111111111';

        const admin = await createFixtureUser({ role: 'admin', adminDomain: 'vtb.demo' });
        const { agent } = await loginAsFixture(admin.email, admin.password);

        const res = await agent.get('/admin/blockchain-status');
        expect(res.status).toBe(200);
        expect(res.body.connected).toBe(false);
        expect(res.body.rpcUrl).toBeUndefined();
        expect(JSON.stringify(res.body)).not.toContain(SECRET_RPC_KEY);
        expect(res.body.reason).not.toContain(SECRET_RPC_KEY);
      } finally {
        process.env.RPC_URL = origRpc;
        process.env.CONTRACT_ADDRESS = origContract;
      }
    });
  });

  describe('POST /api/elections/register-vote', () => {
    it('no filtra blockchainError.message con credenciales RPC en caso de error en castVote', async () => {
      const fakeError = new Error(`execution failed on RPC url: ${RPC_WITH_KEY}`);
      const mockPort: VotePort = {
        castVote: vi.fn(async () => { throw fakeError; }),
        findVote: vi.fn(async () => ({ estado: 'no-esta' }) as const),
        getTally: vi.fn(async () => [0, 0]),
      };
      setVotePortForTesting(mockPort);

      const user = await createFixtureUser({ email: `voter-${Date.now()}@ufv.es` });
      const electionId = await createFixtureElection({
        blockchainId: 9001,
        name: `Eleccion test rpc leak ${Date.now()}`,
        candidates: ['Cand A', 'Cand B'],
      });
      await db.exec("UPDATE elections SET chain_status = 'synced' WHERE id = ?", [electionId]);
      await db.exec('INSERT INTO election_voters (election_id, user_id) VALUES (?, ?)', [electionId, user.id]);

      const candidatos = await db.run<{ id: number }>(
        'SELECT id FROM candidates WHERE election_id = ? ORDER BY position ASC',
        [electionId],
      );

      const { agent, csrf } = await loginAsFixture(user.email, user.password);
      const res = await agent.post('/api/elections/register-vote')
        .set('X-CSRF-Token', csrf)
        .send({ electionId, candidateId: candidatos[0].id });

      expect(res.status).toBe(500);
      expect(JSON.stringify(res.body)).not.toContain(SECRET_RPC_KEY);
      expect(res.body.details).not.toContain(SECRET_RPC_KEY);
    });
  });
});
