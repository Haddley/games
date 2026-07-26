// The shared presence + seat-claiming rules (common.js).
//
// These replaced a rule that was copy-pasted into all 18 games and had already drifted in
// two. They exist because of two real reports:
//   • a room waiting on a player who had left, every round;
//   • a lobby filling with ghosts of one person who kept closing and reopening the browser.
//
// The browser file is evaluated with `new Function`, with the clock passed in as a parameter
// so tests can move time without touching globals (the pattern in common-prefs.test.js).
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const SRC = fs.readFileSync(path.join(__dirname, '..', 'common.js'), 'utf8');
function grab(start, end) {
    const a = SRC.indexOf(start);
    assert.ok(a >= 0, `not found: ${start}`);
    const b = SRC.indexOf(end, a);
    assert.ok(b > a, `no end for ${start}`);
    return SRC.slice(a, b + end.length);
}
const api = new Function('Date', [
    grab('const HEARTBEAT_MS', ';'),
    grab('const PRESENCE_MS', ';'),
    grab('function notePresence(player) {', '\n}'),
    grab('function isPresent(player, conns) {', '\n}'),
    grab('function claimSeat(players, msg, newId, conns, inLobby) {', '\n}'),
    'return { notePresence, isPresent, claimSeat, HEARTBEAT_MS, PRESENCE_MS };',
].join('\n'));

// a fake clock, so "13 seconds later" is instant
function at(ms) { return api({ now: () => ms }); }

test('a heartbeat is frequent enough that a live phone is never mistaken for a dead one', () => {
    const { HEARTBEAT_MS, PRESENCE_MS } = at(0);
    assert.ok(HEARTBEAT_MS > 0 && PRESENCE_MS > 0);
    assert.ok(PRESENCE_MS >= HEARTBEAT_MS * 3,
        `a phone gets ${(PRESENCE_MS / HEARTBEAT_MS).toFixed(1)} beats before being written off — ` +
        'too few, and one dropped packet on a bad wifi marks a present player absent');
    assert.ok(PRESENCE_MS <= 20000, 'and a genuinely dead phone must be noticed within a few seconds');
});

test('any message counts as proof of life, not just the heartbeat', () => {
    const { notePresence, isPresent } = at(1000);
    const p = { id: 'a' };
    assert.strictEqual(notePresence(p), p, 'it returns the player, so it can wrap a lookup');
    assert.strictEqual(p.seen, 1000);
    assert.ok(isPresent(p, { a: {} }));
    assert.doesNotThrow(() => notePresence(null), 'a message from a non-player must not throw');
    assert.doesNotThrow(() => notePresence(undefined));
});

test('a phone goes quiet: present, then not, and the connection map does not save it', () => {
    const p = { id: 'a', seen: 1000 };
    const conns = { a: {} };                       // the connection NEVER closes — that's the bug
    assert.ok(at(2000).isPresent(p, conns), 'a second later: here');
    assert.ok(at(1000 + 12000).isPresent(p, conns), 'just inside the window: still here');
    assert.ok(!at(1000 + 14000).isPresent(p, conns),
        'past the window: gone, even though guestConns still lists them — this is the whole point');
});

test('a player who has only just joined is present until their first heartbeat', () => {
    const { isPresent } = at(5000);
    const fresh = { id: 'a' };                     // no `seen` yet
    assert.ok(isPresent(fresh, { a: {} }), 'an open connection stands in until the first beat');
    assert.ok(!isPresent(fresh, {}), 'but with no connection at all they are not here');
});

test('the same device always reclaims its seat, however alive the old connection looks', () => {
    // The bug: the old rule only reclaimed a seat whose connection appeared dead, and a
    // closed browser never does. So the device got a second seat, then a third…
    const { claimSeat } = at(1000);
    const players = [{ id: 'old', name: 'Neil', cid: 'dev1', seen: 1000 }];
    const conns = { old: {} };                     // still "connected", because close never fires
    const got = claimSeat(players, { cid: 'dev1', name: 'Neil' }, 'new', conns);
    assert.strictEqual(got, players[0], 'a cid match must win outright — a device is in one place');
});

test('a restarted browser has a NEW device id, so the name has to carry it', () => {
    // sessionStorage is cleared when the browser closes, so cid cannot match. This is exactly
    // the reported Tic Tac Toe case.
    const players = [{ id: 'old', name: 'Neil', cid: 'dev1', seen: 1000 }];
    const conns = { old: {} };                     // the ghost connection, still listed
    // straight away, the old seat still looks alive, so we do NOT steal it
    assert.strictEqual(at(2000).claimSeat(players, { cid: 'dev2', name: 'Neil' }, 'new', conns), null);
    // once it has gone quiet, the returning Neil takes his seat back rather than making a ghost
    const got = at(1000 + 14000).claimSeat(players, { cid: 'dev2', name: 'Neil' }, 'new', conns);
    assert.strictEqual(got, players[0], 'the same name + a silent seat = the same person coming back');
});

test('two different people called Ben both get a seat', () => {
    // The reason a name match is weaker than a cid match: families do have two Bens, and the
    // second one must not be handed the first one's score.
    const { claimSeat } = at(1000);
    const players = [{ id: 'ben1', name: 'Ben', cid: 'dev1', seen: 1000 }];
    const conns = { ben1: {} };
    assert.strictEqual(claimSeat(players, { cid: 'dev2', name: 'Ben' }, 'ben2', conns), null,
        'the first Ben is present, so the second Ben is a new player');
});

test('claimSeat never matches the joiner to themselves, and copes with nonsense', () => {
    const { claimSeat } = at(1000);
    const players = [{ id: 'same', name: 'Neil', cid: 'dev1', seen: 1000 }];
    assert.strictEqual(claimSeat(players, { cid: 'dev1', name: 'Neil' }, 'same', {}), null,
        'a player must never be matched to their own seat');
    assert.strictEqual(claimSeat([], { cid: 'x', name: 'y' }, 'z', {}), null);
    assert.strictEqual(claimSeat(null, { cid: 'x' }, 'z', {}), null);
    assert.strictEqual(claimSeat(players, {}, 'z', {}), null, 'no cid and no name matches nothing');
    assert.strictEqual(claimSeat(players, { name: '' }, 'z', {}), null);
    // a device with storage disabled sends no cid, so it falls back to the name
    const quiet = [{ id: 'old', name: 'Neil', seen: 1000 }];
    assert.strictEqual(at(30000).claimSeat(quiet, { name: 'Neil' }, 'new', {}), quiet[0]);
});

test('every game uses the shared rule rather than its own copy', () => {
    // This is what stops it drifting again: 16 of the 18 copies were byte-identical and two
    // had already diverged, which is exactly how one game ends up behaving differently.
    const root = path.join(__dirname, '..');
    const games = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'index.html');
    const withRooms = games.filter(f => fs.readFileSync(path.join(root, f), 'utf8').includes("type: 'join'")
        || fs.readFileSync(path.join(root, f), 'utf8').includes("type:'join'"));
    assert.ok(withRooms.length >= 15, `only found ${withRooms.length} games with rooms`);
    const missing = { claim: [], beat: [] };
    withRooms.forEach(f => {
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        if (src.includes('const zombie') && !src.includes('claimSeat(')) missing.claim.push(f);
        if (!src.includes('startHeartbeat')) missing.beat.push(f);
    });
    assert.deepStrictEqual(missing.claim, [], 'these games still hand-roll the seat-reclaim rule');
    assert.deepStrictEqual(missing.beat, [], 'these games never send a heartbeat, so the host cannot tell they are alive');
});

test('in the LOBBY a matching name takes its seat back at once — no waiting it out', () => {
    // The bug this fixes, from a photo of a real lobby: "Neil, Karen, Karen, Karen", every
    // ghost showing a green dot. Somebody restarting their browser is back in about five
    // seconds, well inside PRESENCE_MS, so the mid-game rule refused to give the seat back
    // and made a new one instead — three times.
    const { claimSeat } = at(1000);
    const players = [{ id: 'old', name: 'Karen', cid: 'dev1', seen: 1000 }];
    const conns = { old: {} };                       // still looks perfectly present
    assert.strictEqual(claimSeat(players, { cid: 'dev2', name: 'Karen' }, 'new', conns, true),
        players[0], 'in a lobby there is nothing to steal, so the name is enough');
    assert.strictEqual(claimSeat(players, { cid: 'dev2', name: 'Karen' }, 'new', conns, false), null,
        'but mid-game the same shortcut would hand over somebody else\'s score');
});

test('every game tells claimSeat whether it is in the lobby', () => {
    const root = path.join(__dirname, '..');
    const bad = fs.readdirSync(root)
        .filter(f => f.endsWith('.html'))
        .filter(f => {
            const src = fs.readFileSync(path.join(root, f), 'utf8');
            return src.includes('claimSeat(H.players') && !src.includes("H.phase === 'lobby')");
        });
    assert.deepStrictEqual(bad, [], 'these games never pass the lobby flag, so restarts make ghosts');
});
