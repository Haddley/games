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
    // …and it does not matter how quickly he comes back. Requiring the old seat to go quiet
    // first is what put "Neil (you)" on a Buzzin' scoreboard twice, on 1 point and 0.
    assert.strictEqual(at(2000).claimSeat(players, { cid: 'dev2', name: 'Neil' }, 'new', conns),
        players[0], 'straight back = same person');
    assert.strictEqual(at(1000 + 14000).claimSeat(players, { cid: 'dev2', name: 'Neil' }, 'new', conns),
        players[0], 'back later = still the same person');
});

test('one name is one person — the deliberate trade', () => {
    // Two different people who both type "Ben" now SHARE a seat. That is a real cost, and it
    // is the lesser one: it is visible in the lobby and fixed by retyping a name, whereas the
    // alternative broke the game invisibly every time anyone's phone reconnected mid-play.
    const { claimSeat } = at(1000);
    const players = [{ id: 'ben1', name: 'Ben', cid: 'dev1', seen: 1000 }];
    const conns = { ben1: {} };
    assert.strictEqual(claimSeat(players, { cid: 'dev2', name: 'Ben' }, 'ben2', conns), players[0],
        'a second Ben takes the first Ben\'s seat rather than making a duplicate');
    // a DIFFERENT name is still a different person
    assert.strictEqual(claimSeat(players, { cid: 'dev2', name: 'Bea' }, 'bea', conns), null);
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
        players[0], 'in a lobby');
    assert.strictEqual(claimSeat(players, { cid: 'dev2', name: 'Karen' }, 'new', conns, false),
        players[0], 'and mid-game too — a reconnect must not mint a second scoreboard row');
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

test('the heartbeat and presence logic exists in common.js and NOWHERE else', () => {
    // The whole point. This rule used to be copy-pasted into all 18 games — 16 identical, 2
    // already drifted, plus a third variant in ticktacktoe — which is exactly how one game
    // ends up behaving differently from the rest and nobody notices for months.
    const root = path.join(__dirname, '..');
    const defines = /function (startHeartbeat|stopHeartbeat|notePresence|isPresent|claimSeat)\s*\(/;
    const offenders = fs.readdirSync(root)
        .filter(f => (f.endsWith('.html') || f.endsWith('.js')) && f !== 'common.js')
        .filter(f => defines.test(fs.readFileSync(path.join(root, f), 'utf8')));
    assert.deepStrictEqual(offenders, [],
        'these files define their own copy of shared presence logic — it belongs in common.js');

    // …and every game reaches it the same way, through a guard, so a stale cached common.js
    // degrades instead of throwing a ReferenceError and blanking the page.
    const games = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'index.html');
    const rooms = games.filter(f => fs.readFileSync(path.join(root, f), 'utf8').includes('startHeartbeat'));
    assert.ok(rooms.length >= 18, `only ${rooms.length} games send a heartbeat`);
    rooms.forEach(f => {
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        assert.match(src, /typeof startHeartbeat === 'function'/,
            `${f} calls startHeartbeat unguarded — a stale common.js would blank the page`);
    });
});

test('the presence sweep re-asks unconditionally, and cannot be killed by a game', () => {
    // It deliberately does NOT try to skip ticks where the player set looks unchanged. That
    // optimisation was in the first version and was quietly wrong: the set can change before
    // the game reaches the state where the answer matters, and then it never changes again.
    const src = SRC.slice(SRC.indexOf('function watchPresence'), SRC.indexOf('function stopPresenceWatch'));
    assert.doesNotMatch(src, /if \(now === last\) return;/,
        'skipping unchanged ticks reintroduces the stall this exists to prevent');
    assert.match(src, /catch \(_\) \{\}/, "a game's advance logic must not be able to kill the sweep");
    assert.match(src, /setInterval/);
    assert.match(SRC, /function stopPresenceWatch\(\)/);
});

test('every game that waits for all players re-asks when one leaves', () => {
    // THE stall: `if (active.every(p => p.answered)) close()` is only ever asked when somebody
    // answers. If the last player present answers while a departed phone still counts, nobody
    // asks again — and eight of these games have no round timer to rescue them.
    const root = path.join(__dirname, '..');
    const waiters = fs.readdirSync(root).filter(f => f.endsWith('.html')).filter(f => {
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        return src.split('\n').some(l => !l.trim().startsWith('//') &&
            /(active|connectedPlayers\(\)|playingNow\(\))\.every\(/.test(l));
    });
    assert.ok(waiters.length >= 8, `only found ${waiters.length} games that wait for everyone`);
    // rockpaperscissors and buzzin moved their gate into a named function during this work,
    // so the regex above no longer sees them — they still wait for everyone, so name them.
    ['rockpaperscissors.html', 'buzzin.html'].forEach(f => { if (!waiters.includes(f)) waiters.push(f); });
    const unwatched = waiters.filter(f => {
        const src = fs.readFileSync(path.join(root, f), 'utf8');
        return !(src.includes('hostPresenceRecheck') && src.includes('watchPresence(hostPresenceRecheck)'));
    });
    assert.deepStrictEqual(unwatched, [],
        'these games wait for every player but never re-ask when one leaves — they can stall for ever');
});

// ── the shared rekey ─────────────────────────────────────────────────────────
const REKEY = new Function(grab('function rekeyPlayerId(H, oldId, newId, spec) {', '\n}') +
    '\nreturn rekeyPlayerId;')();

test('rekeyPlayerId moves a player id in every shape a game stores one', () => {
    const H = {
        turn: 'old',                                   // scalar
        turnOrder: ['a', 'old', 'b'],                  // array of ids
        eliminated: ['old'],
        votes: { old: 'someone', other: 'old' },       // keyed BY id, and a value pointing AT them
        card: { who: 'old', t: 'Sprint!' },            // {who: id}
        moved: { id: 'old', to: 7 },                   // {id: id}
        untouched: 'old',                              // not in the spec — must be left alone
    };
    REKEY(H, 'old', 'new', {
        scalars: ['turn'], arrays: ['turnOrder', 'eliminated'],
        maps: ['votes'], whoObjs: ['card'], idObjs: ['moved'],
    });
    assert.strictEqual(H.turn, 'new');
    assert.deepStrictEqual(H.turnOrder, ['a', 'new', 'b']);
    assert.deepStrictEqual(H.eliminated, ['new']);
    assert.deepStrictEqual(H.votes, { new: 'someone', other: 'new' },
        'a vote cast FOR the returning player has to follow them too');
    assert.strictEqual(H.card.who, 'new');
    assert.strictEqual(H.moved.id, 'new');
    assert.strictEqual(H.untouched, 'old', 'it must only touch the fields it was given');
});

test('rekeyPlayerId is safe on missing, empty and nonsense state', () => {
    assert.doesNotThrow(() => REKEY(null, 'a', 'b', { scalars: ['turn'] }));
    assert.doesNotThrow(() => REKEY({}, 'a', 'b', { arrays: ['nope'], maps: ['nope'], whoObjs: ['nope'], idObjs: ['nope'] }));
    assert.doesNotThrow(() => REKEY({ turn: 'a' }, 'a', 'b'));            // no spec at all
    const H = { votes: null, turnOrder: 'not an array', card: null };
    assert.doesNotThrow(() => REKEY(H, 'a', 'b', { maps: ['votes'], arrays: ['turnOrder'], whoObjs: ['card'] }));
    assert.strictEqual(H.turnOrder, 'not an array', 'a field of the wrong type is left alone');
    // a no-op rekey must not churn state
    const same = { turn: 'a' };
    REKEY(same, 'a', 'a', { scalars: ['turn'] });
    assert.strictEqual(same.turn, 'a');
});

test('AUDIT: no game stores a player id somewhere its rekey does not cover', () => {
    // This is the audit itself, as a test. It reads every game for state keyed by a player id
    // and fails if that game either has no rekey at all or does not name the field. Three
    // games were found this way (brokenpencil, buzzin, familytrivia) after the same bug had
    // already been fixed by hand in three others.
    const root = path.join(__dirname, '..');
    const problems = [];
    fs.readdirSync(root).filter(f => f.endsWith('.html')).forEach(file => {
        const src = fs.readFileSync(path.join(root, file), 'utf8');
        if (!src.includes('guestConns')) return;
        const code = src.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
        const fields = new Set();
        for (const m of code.matchAll(/H\.(\w+)\[\s*(?:player|p)\.id\s*\]/g)) fields.add(m[1]);
        for (const m of code.matchAll(/H\.(\w+)\.push\(\s*(?:player|p|conn)\.(?:id|peer)\s*\)/g)) fields.add(m[1]);
        for (const m of code.matchAll(/H\.(\w+)\s*=\s*H\.players\.map\(\s*p\s*=>\s*p\.id/g)) fields.add(m[1]);
        fields.delete('players');                       // the array itself, not a key
        if (!fields.size) return;
        const rekeyAt = src.indexOf('function hostRekeyPlayer');
        if (rekeyAt < 0) { problems.push(`${file}: keys state by player id (${[...fields]}) but has NO hostRekeyPlayer`); return; }
        const rekey = src.slice(rekeyAt, src.indexOf('\n}', rekeyAt));
        [...fields].forEach(f => {
            if (!new RegExp(`H\\.${f}\\b|'${f}'`).test(rekey)) {
                problems.push(`${file}: H.${f} is keyed by player id but the rekey never mentions it`);
            }
        });
    });
    assert.deepStrictEqual(problems, [], '\n  ' + problems.join('\n  '));
});

const PRESENT = new Function('Date', grab('const PRESENCE_MS', ';') + '\n' +
    grab('function isPresent(player, conns) {', '\n}') + '\n' +
    grab('function presentPlayers(players, conns, selfId, selfPlays) {', '\n}') +
    '\nreturn presentPlayers;');

test('presentPlayers: the host counts only when the host is playing', () => {
    const now = 1000;
    const fn = PRESENT({ now: () => now });
    const players = [{ id: 'me' }, { id: 'a', seen: now }, { id: 'gone', seen: now - 60000 }];
    const conns = { a: {}, gone: {} };                 // 'gone' still LOOKS connected
    // a phone host is a player
    assert.deepStrictEqual(fn(players, conns, 'me', true).map(p => p.id), ['me', 'a']);
    // a TV host is not
    assert.deepStrictEqual(fn(players, conns, 'me', false).map(p => p.id), ['a']);
    // and the departed phone is excluded despite its live-looking connection — this is what
    // lets a round close when the player everyone was waiting for has gone
    assert.ok(!fn(players, conns, 'me', true).some(p => p.id === 'gone'));
});

test('AUDIT: no game keeps its own copy of "who is here"', () => {
    const root = path.join(__dirname, '..');
    const offenders = fs.readdirSync(root)
        .filter(f => f.endsWith('.html'))
        .filter(f => {
            const src = fs.readFileSync(path.join(root, f), 'utf8');
            if (!src.includes('function connectedPlayers')) return false;
            return !src.includes('presentPlayers(H.players, guestConns, myId');
        });
    assert.deepStrictEqual(offenders, [],
        'these games hand-roll "who is here" instead of using common.js presentPlayers');
});

test('every page cache-busts the shared scripts', () => {
    // The rules that decide rejoining live in common.js, and GitHub Pages caches it. A phone
    // holding yesterday's copy runs yesterday's rules while the game's inline code is new —
    // which looks exactly like "the fix didn't work". Duplicate lobby rows kept being reported
    // after each fix was live, and a stale common.js is the most likely reason.
    //
    // Bump the token whenever a shared script changes:
    //   V=$(date +%Y%m%d)-$(git rev-parse --short HEAD)
    //   … rewrite src="common.js?v=$V" in every page (see the commit that added this)
    const root = path.join(__dirname, '..');
    const shared = ['common.js', 'p2p.js', 'fx.js', 'audio.js', 'ambient.js', 'dice.js'];
    const bad = [];
    fs.readdirSync(root).filter(f => f.endsWith('.html')).forEach(file => {
        const src = fs.readFileSync(path.join(root, file), 'utf8');
        shared.forEach(js => {
            const plain = new RegExp('src="' + js.replace('.', '\\.') + '"');
            if (plain.test(src)) bad.push(`${file} loads ${js} with no ?v= token`);
        });
    });
    assert.deepStrictEqual(bad, [], '\n  ' + bad.join('\n  '));
    // and every page that loads common.js uses the SAME token, or they disagree about the rules
    const tokens = new Set();
    fs.readdirSync(root).filter(f => f.endsWith('.html')).forEach(file => {
        const m = /src="common\.js\?v=([^"]+)"/.exec(fs.readFileSync(path.join(root, file), 'utf8'));
        if (m) tokens.add(m[1]);
    });
    assert.strictEqual(tokens.size, 1, `pages disagree on the common.js version: ${[...tokens]}`);
});

// ── the build handshake ──────────────────────────────────────────────────────
const WARN = new Function('BUILD', grab('function warnIfStale(conn, msg, sendFn) {', '\n}') +
    '\nreturn warnIfStale;');

test('a stale phone is told, and a matching one is left alone', () => {
    const sent = [];
    const send = (c, m) => sent.push(m);
    const warn = WARN('new-build');
    assert.strictEqual(warn({}, { build: 'new-build' }, send), false, 'same build: nothing to say');
    assert.strictEqual(warn({}, { build: 'old-build' }, send), true, 'different build: tell them');
    assert.deepStrictEqual(sent, [{ type: 'version', host: 'new-build', yours: 'old-build' }]);
});

test('nobody is nagged while developing, or by a page too old to declare a build', () => {
    const sent = [];
    const send = (c, m) => sent.push(m);
    // a host running from the filesystem has no ?v= token, so it must never warn anyone
    assert.strictEqual(WARN('dev')({}, { build: 'anything' }, send), false);
    // …and a phone that predates the handshake sends no build at all
    assert.strictEqual(WARN('new')({}, {}, send), false);
    assert.strictEqual(WARN('new')({}, { build: 'dev' }, send), false);
    assert.strictEqual(WARN('new')(null, null, send), false, 'and junk must not throw');
    assert.deepStrictEqual(sent, [], 'none of those may produce a warning');
});

test('a send that throws cannot break a join', () => {
    // warnIfStale runs inside the join handler; a dead connection must not take the room down
    const boom = () => { throw new Error('connection gone'); };
    assert.doesNotThrow(() => WARN('new')({}, { build: 'old' }, boom));
});

test('the build is read off common.js\'s own URL, so it cannot drift from the ?v= token', () => {
    const src = grab('const BUILD = (function () {', '})();');
    assert.ok(src.includes('common'), 'it finds its own script tag');
    assert.ok(src.includes('v=('), 'and reads the v= token from it');
    assert.match(src, /'dev'/, 'falling back to dev, which never warns');
    // every game declares it when joining, and listens for the answer
    const root = path.join(__dirname, '..');
    const games = fs.readdirSync(root).filter(f => f.endsWith('.html') && f !== 'index.html');
    const gaps = [];
    games.forEach(f => {
        const s = fs.readFileSync(path.join(root, f), 'utf8');
        if (!s.includes('guestConns') && !s.includes('tvAddPlayer')) return;   // not a P2P game
        if (!/build: typeof BUILD/.test(s)) gaps.push(`${f}: joins without declaring its build`);
        if (!s.includes('warnIfStale')) gaps.push(`${f}: host never tells a stale phone`);
        if (!s.includes('showStaleBuild')) gaps.push(`${f}: phone never acts on being told`);
    });
    assert.deepStrictEqual(gaps, [], '\n  ' + gaps.join('\n  '));
});

test('the TURN credentials exist in exactly one file', () => {
    // ticktacktoe used to carry its own copy inside TTT_PEER_OPTS, so rotating the Metered
    // key was a two-place change — and forgetting the second place breaks remote play in one
    // game only, silently. CLAUDE.md documented that hazard; now there is nothing to forget.
    const root = path.join(__dirname, '..');
    const files = fs.readdirSync(root).filter(f => f.endsWith('.html') || f.endsWith('.js'));
    const holders = files.filter(f => /metered\.ca/.test(fs.readFileSync(path.join(root, f), 'utf8')));
    assert.deepStrictEqual(holders, ['common.js'],
        `TURN config should live only in common.js, but also appears in: ${holders.filter(h => h !== 'common.js')}`);
    // A game may create peers two ways, and only one of them needs to say ICE_CFG:
    //   hostPeer()/joinPeer()  — p2p.js passes ICE_CFG itself; the game needs no knowledge
    //   new Peer()             — raw, so it MUST pass ICE_CFG or remote players silently fail
    const raw = files.filter(f => f.endsWith('.html'))
        .filter(f => {
            const src = fs.readFileSync(path.join(root, f), 'utf8');
            return /new Peer\(/.test(src) && !/ICE_CFG/.test(src);
        });
    assert.deepStrictEqual(raw, [],
        'these games call new Peer() without the shared ICE config — remote players would fail');
});
