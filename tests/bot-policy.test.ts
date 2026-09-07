import { test } from 'node:test';
import assert from 'node:assert/strict';
import { botEligibility,validBotParameters } from '../lib/engine/bot-policy';
import { probability } from '../lib/engine/signals';
import type { Signal } from '../lib/engine/pipeline';
const signal=(wins:number,samples:number):Signal=>({action:'BUY',score:70,factors:[],id:'test',time:100,symbol:'BTCUSDT',entry:100,stop:98,target:104,estimate:probability(wins,samples)});
test('bot suppresses unavailable, sparse, HOLD, and below-threshold estimates',()=>{
 const parameters={minimumReliability:60,minimumSamples:30};
 assert.equal(botEligibility(signal(0,0),parameters).allowed,false);
 assert.equal(botEligibility(signal(10,10),parameters).allowed,false);
 assert.equal(botEligibility(signal(15,30),parameters).allowed,false);
 assert.equal(botEligibility({...signal(29,30),action:'HOLD'},parameters).allowed,false);
 assert.equal(botEligibility(signal(24,30),parameters).allowed,true);
 assert.equal(botEligibility(signal(24,30),{...parameters,minimumReliability:90}).allowed,false);
});
test('bot filter respects exact boundary without rounding upward into eligibility',()=>{
 const s=signal(24,30);const threshold=s.estimate.percent!;
 assert.equal(botEligibility(s,{minimumReliability:threshold,minimumSamples:30}).allowed,true);
 assert.equal(botEligibility(s,{minimumReliability:threshold+.01,minimumSamples:30}).allowed,false);
 assert.equal(validBotParameters({minimumReliability:NaN,minimumSamples:30}),false);
 assert.equal(validBotParameters({minimumReliability:60,minimumSamples:0}),false);
 assert.equal(validBotParameters({minimumReliability:101,minimumSamples:30}),false);
});
