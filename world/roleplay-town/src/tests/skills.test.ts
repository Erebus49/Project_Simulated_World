import assert from 'node:assert/strict';
import { test } from 'node:test';
import { WorldRuntime } from '../engine/runtime.js';
import { MockDecisionProvider } from '../agents/mock.js';
import { replay } from '../engine/events.js';
import { roleplayConfig } from '../scenarios/roleplayTown.js';

const wait=()=>({type:'wait',params:{durationTicks:3}});
test('a skill walks to its concrete target before acting; effects occur only at completion',async()=>{
  const engine=new WorldRuntime(new MockDecisionProvider(observation=>observation.self.id==='owner'&&!observation.skillHistory?.['clean_table:cafe-table']?
    {type:'use_skill',params:{skillId:'clean_table',targetId:'cafe-table'}}:wait()),roleplayConfig());
  await engine.step();
  const activity=engine.snapshot().agents.owner!.activity!;
  assert.equal(activity.stage,'approaching');assert.equal(engine.snapshot().sceneObjects!['cafe-table']!.state.cleanliness,20);
  assert.equal(engine.snapshot().sceneObjects!['cafe-table']!.reservedBy,'owner');
  while(engine.snapshot().tick<activity.actAtTick)await engine.step();
  assert.equal(engine.snapshot().agents.owner!.activity!.stage,'acting');
  assert.deepEqual(engine.snapshot().agents.owner!.position,{x:218,y:324});
  assert.equal(engine.snapshot().sceneObjects!['cafe-table']!.state.cleanliness,20);
  while(engine.snapshot().tick<activity.dueTick)await engine.step();
  assert.equal(engine.snapshot().sceneObjects!['cafe-table']!.state.cleanliness,60);
  assert.equal(engine.snapshot().sceneObjects!['cafe-table']!.reservedBy,null);
  assert.equal(engine.snapshot().agents.owner!.activity,null);
  const archive=engine.archive();assert.deepEqual(replay(archive.initialState,archive.events),archive.finalState);
});
test('two agents cannot work on the same reserved object and do not get both effects',async()=>{
  const engine=new WorldRuntime(new MockDecisionProvider(observation=>['owner','barista'].includes(observation.self.id)?
    {type:'use_skill',params:{skillId:'clean_table',targetId:'cafe-table'}}:wait()),roleplayConfig());
  const result=await engine.step();
  assert.equal(result.outcomes.filter(outcome=>outcome.type==='use_skill'&&outcome.accepted).length,1);
  assert.equal(result.outcomes.filter(outcome=>outcome.reason==='target_reserved').length,1);
  assert.equal(engine.snapshot().sceneObjects!['cafe-table']!.state.cleanliness,20);
});
test('a persona cannot invent skills, use a remote target, or learn other private personas',async()=>{
  const engine=new WorldRuntime(new MockDecisionProvider(observation=>observation.self.id==='owner'?
    {type:'use_skill',params:{skillId:'take_photo',targetId:'old-street-view'}}:observation.self.id==='supplier'?
    {type:'use_skill',params:{skillId:'read_notice',targetId:'notice-board'}}:wait()),roleplayConfig());
  const result=await engine.step();
  assert.ok(result.outcomes.some(outcome=>outcome.agentId==='owner'&&outcome.reason==='skill_not_owned'));
  assert.ok(result.outcomes.some(outcome=>outcome.agentId==='supplier'&&outcome.reason==='target_not_here'));
  const observation=engine.observe('owner');
  assert.ok(observation.character?.skillIds.includes('clean_table'));
  assert.equal(observation.skills?.some(skill=>skill.id==='take_photo'),false);
  assert.equal(observation.objects?.some(object=>object.id==='market-ledger'),false);
  assert.equal(JSON.stringify(observation).includes('烘焙店的录用通知'),false);
});
