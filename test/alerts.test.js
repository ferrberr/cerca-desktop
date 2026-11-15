import test from 'node:test';
import assert from 'node:assert/strict';
import {notifyNewMatches} from '../desktop/alert-matches.js';
const alert={id:1,query:'MacBook M2'},item={id:10,price:650,demo:false,available:true};
const makeStore=()=>({data:{notified:{}},flush(){this.flushed=true;}});
test('alert refresh only notifies unseen listing prices, including price drops',async()=>{const store=makeStore();let notifications=0;const notify=async()=>{notifications++;};assert.equal(await notifyNewMatches(alert,[item],store,notify),1);assert.equal(await notifyNewMatches(alert,[item],store,notify),0);assert.equal(await notifyNewMatches(alert,[{...item,price:600}],store,notify),1);assert.equal(notifications,2);assert.equal(store.flushed,true);});
test('an undelivered notification is not marked as notified',async()=>{const store=makeStore();await assert.rejects(notifyNewMatches(alert,[item],store,async()=>{throw new Error('Desktop offline');}));assert.deepEqual(store.data.notified,{});});
test('unavailable, reserved and demo products never generate alerts',async()=>{const store=makeStore();const rows=[{...item,demo:true},{...item,available:false},{...item,reserved:true}];assert.equal(await notifyNewMatches(alert,rows,store,async()=>{throw new Error('Should not run');}),0);});
test('duplicate provider results produce one notification per product and price',async()=>{const store=makeStore();assert.equal(await notifyNewMatches(alert,[item,item],store,async()=>{}),1);});
