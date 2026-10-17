import { MockDecisionProvider } from './agents/mock.js';
import { WorldRuntime } from './engine/runtime.js';
import { replay } from './engine/events.js';

const engine = new WorldRuntime(new MockDecisionProvider(), { seed: 417, agentCount: 6 });
engine.enqueueCommand({ commandId: 'demo-rumor-1', type: 'inject_message', recipientId: 'messenger', content: '明天咖啡可能涨价。这个说法尚未核实。' });
engine.start();
for (let tick = 0; tick < 12; tick++) {
  const batch = await engine.advance();
  const world = engine.snapshot();
  console.log(`tick=${world.tick} batch=${batch.batchId?.split(':').at(-1) ?? '-'} decisions=${batch.selectedAgentIds.length} price=${world.shops.coffee!.unitPrice} stock=${world.shops.coffee!.stock}`);
}
engine.pause();
const archive = engine.archive();
const reconstructed = replay(archive.initialState, archive.events);
if (JSON.stringify(reconstructed) !== JSON.stringify(archive.finalState)) throw new Error('Replay did not reconstruct the final state');
console.log(JSON.stringify({ mode: 'Mock only — no API requests', phaseOrder: ['message', 'resource', 'task'],
  tick: reconstructed.tick, status: reconstructed.status, shop: reconstructed.shops.coffee,
  agents: Object.values(reconstructed.agents).map(agent => ({ id: agent.id, location: agent.locationId, money: agent.money,
    coffee: agent.inventory.coffee ?? 0, receivedMessages: agent.inbox.length })),
  metrics: reconstructed.metrics, eventCount: archive.events.length, exactReplayMatches: true }, null, 2));
