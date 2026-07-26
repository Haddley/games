// Unit tests for the pure helpers in p2p.js — `npm run test:unit`, no browser.
// p2p.js only touches `Peer`/`document`/`ICE_CFG` *inside* functions, so evaluating
// the file under Node is safe; we just pull out the names we want.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, '..', 'p2p.js'), 'utf8');
const {
    makeRoomCode, isRecoverablePeerError, _p2pCandKind, _p2pPairKind, P2P_ROOM_CHARS,
} = new Function(src + `
;return { makeRoomCode, isRecoverablePeerError, _p2pCandKind, _p2pPairKind, P2P_ROOM_CHARS };`)();

// ── room codes ─────────────────────────────────────────────────────────────────
test('makeRoomCode: four letters, every time', () => {
    for (let i = 0; i < 200; i++) assert.match(makeRoomCode(), /^[A-Z]{4}$/);
});
test('makeRoomCode: never uses I or O (they read as 1 and 0)', () => {
    assert.ok(!P2P_ROOM_CHARS.includes('I'), 'alphabet excludes I');
    assert.ok(!P2P_ROOM_CHARS.includes('O'), 'alphabet excludes O');
    for (let i = 0; i < 500; i++) {
        const c = makeRoomCode();
        assert.ok(!c.includes('I') && !c.includes('O'), `${c} contains I or O`);
    }
});
test('makeRoomCode: draws from the whole alphabet, not a corner of it', () => {
    const seen = new Set();
    for (let i = 0; i < 3000; i++) makeRoomCode().split('').forEach(ch => seen.add(ch));
    assert.strictEqual(seen.size, P2P_ROOM_CHARS.length, 'every allowed letter shows up');
});
test('makeRoomCode: codes differ (not a constant)', () => {
    const codes = new Set(Array.from({ length: 50 }, () => makeRoomCode()));
    assert.ok(codes.size > 40, `expected variety, got ${codes.size} distinct in 50`);
});

// ── which broker errors are worth reconnecting for ────────────────────────────
test('isRecoverablePeerError: transient broker/socket trouble is recoverable', () => {
    for (const type of ['network', 'disconnected', 'server-error', 'socket-error', 'socket-closed'])
        assert.strictEqual(isRecoverablePeerError({ type }), true, type);
});
test('isRecoverablePeerError: a genuinely dead room is NOT recoverable', () => {
    // these must fall through to onFatalError, or a guest waits forever on a room
    // that will never exist
    for (const type of ['peer-unavailable', 'unavailable-id', 'invalid-id', 'browser-incompatible', 'ssl-unavailable'])
        assert.strictEqual(isRecoverablePeerError({ type }), false, type);
});
test('isRecoverablePeerError: junk in, false out', () => {
    assert.strictEqual(isRecoverablePeerError(null), false);
    assert.strictEqual(isRecoverablePeerError(undefined), false);
    assert.strictEqual(isRecoverablePeerError({}), false);
    assert.strictEqual(isRecoverablePeerError({ type: '' }), false);
});

// ── ICE candidates → the badge the room sees ──────────────────────────────────
test('_p2pCandKind: relay candidates, both spellings', () => {
    assert.strictEqual(_p2pCandKind({ candidateType: 'relay' }), 'relay');
    assert.strictEqual(_p2pCandKind({ candidateType: 'relayed' }), 'relay', "WebKit's spelling");
});
test('_p2pCandKind: reflexive candidates mean STUN got us there', () => {
    assert.strictEqual(_p2pCandKind({ candidateType: 'srflx' }), 'stun');
    assert.strictEqual(_p2pCandKind({ candidateType: 'prflx' }), 'stun');
    assert.strictEqual(_p2pCandKind({ candidateType: 'serverreflexive' }), 'stun');
    assert.strictEqual(_p2pCandKind({ candidateType: 'peerreflexive' }), 'stun');
});
test('_p2pCandKind: host candidates mean the same network', () => {
    assert.strictEqual(_p2pCandKind({ candidateType: 'host' }), 'local');
});
test('_p2pCandKind: anything unknown or missing is null, not a guess', () => {
    assert.strictEqual(_p2pCandKind({ candidateType: 'wat' }), null);
    assert.strictEqual(_p2pCandKind({}), null);
    assert.strictEqual(_p2pCandKind(null), null);
    assert.strictEqual(_p2pCandKind(undefined), null);
});

test('_p2pPairKind: ONE relay end is enough to make the pair relayed', () => {
    // it only takes one strict NAT to force the relay for that pair
    assert.strictEqual(_p2pPairKind({ candidateType: 'relay' }, { candidateType: 'host' }), 'relay');
    assert.strictEqual(_p2pPairKind({ candidateType: 'host' }, { candidateType: 'relay' }), 'relay');
    assert.strictEqual(_p2pPairKind({ candidateType: 'srflx' }, { candidateType: 'relay' }), 'relay');
});
test('_p2pPairKind: relay beats stun beats local', () => {
    assert.strictEqual(_p2pPairKind({ candidateType: 'srflx' }, { candidateType: 'host' }), 'stun');
    assert.strictEqual(_p2pPairKind({ candidateType: 'host' }, { candidateType: 'srflx' }), 'stun');
    assert.strictEqual(_p2pPairKind({ candidateType: 'host' }, { candidateType: 'host' }), 'local');
});
test('_p2pPairKind: an unreadable pair reports null rather than lying', () => {
    assert.strictEqual(_p2pPairKind(null, null), null);
    assert.strictEqual(_p2pPairKind({ candidateType: 'wat' }, undefined), null);
});
test('_p2pPairKind: half a pair still classifies', () => {
    assert.strictEqual(_p2pPairKind({ candidateType: 'relay' }, null), 'relay');
    assert.strictEqual(_p2pPairKind(null, { candidateType: 'host' }), 'local');
});
