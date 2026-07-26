// Unit tests for Plump Trek's pure logic — `npm run test:unit`, no browser.
//
// The game lives in an HTML file, so we slice the inline <script> and evaluate only the
// self-contained CONTENT block (board generator + the three decks + the seeded RNG).
// Nothing in that block touches the DOM, PeerJS or the host state.
//
// The most valuable thing here is the DECK INTEGRITY suite: cards are data interpreted
// by applyOps, so a typo'd op key (`o.moveto`) would leave a card that silently does
// nothing in a real game and never fails a test. These read the engine's source and
// assert every op a card uses is one the engine actually implements.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const HTML = fs.readFileSync(path.join(__dirname, '..', 'plumptrek.html'), 'utf8');
const SCRIPT = HTML.slice(HTML.indexOf('<script>\n'), HTML.lastIndexOf('</script>'));

function slice(fromMarker, toMarker) {
    const a = SCRIPT.indexOf(fromMarker);
    const b = SCRIPT.indexOf(toMarker, a);
    assert.ok(a >= 0 && b > a, `could not slice ${fromMarker} → ${toMarker}`);
    return SCRIPT.slice(a, b);
}
const CONTENT = slice('// CONTENT — board, Gimmicks, Finales, Builds', '// ═══════════════════════════════════════════\n// CONSTANTS');
const ENGINE = slice('// HOST GAME FLOW', '// ═══════════════════════════════════════════\n// PHONE');
// Grab one declaration by its opening line and its closing brace/semicolon — sturdier
// than slicing between section banners, which move as the file grows.
function grab(start, end) {
    const a = SCRIPT.indexOf(start);
    assert.ok(a >= 0, `not found: ${start}`);
    const b = SCRIPT.indexOf(end, a);
    assert.ok(b > a, `no end (${end}) for ${start}`);
    return SCRIPT.slice(a, b + end.length);
}

const api = new Function(CONTENT + `
;return { GIMMICKS, FINALES, BUILDS, makeBoard, BOARD_LENS, seedRng, rnd, rndInt, rshuffle, SPACE_LABEL };`)();
const { GIMMICKS, FINALES, BUILDS, makeBoard, BOARD_LENS, seedRng, rnd, rshuffle } = api;
const { placeSquare, BOARD_RUN, PIPS, FACE_ROT } = new Function([
    grab('const BOARD_RUN', ';'),
    grab('function placeSquare(k) {', '\n}'),
    grab('const PIPS = {', '\n};'),
    grab('const FACE_ROT = {', '\n};'),
    'return { placeSquare, BOARD_RUN, PIPS, FACE_ROT };',
].join('\n'))();

// ── the seeded RNG: same seed, same game ─────────────────────────────────────
test('seedRng: the same seed replays the same numbers', () => {
    seedRng(12345);
    const a = Array.from({ length: 20 }, () => rnd());
    seedRng(12345);
    assert.deepStrictEqual(Array.from({ length: 20 }, () => rnd()), a);
});
test('seedRng: different seeds diverge', () => {
    seedRng(1); const a = Array.from({ length: 8 }, () => rnd());
    seedRng(2); const b = Array.from({ length: 8 }, () => rnd());
    assert.notDeepStrictEqual(a, b);
});
test('rnd stays inside [0, 1)', () => {
    seedRng(7);
    for (let i = 0; i < 5000; i++) { const v = rnd(); assert.ok(v >= 0 && v < 1, `${v} out of range`); }
});
test('rshuffle keeps every element, and does move them', () => {
    seedRng(99);
    const src = Array.from({ length: 40 }, (_, i) => i);
    const out = rshuffle(src);
    assert.deepStrictEqual(out.slice().sort((x, y) => x - y), src, 'same elements');
    assert.deepStrictEqual(src, Array.from({ length: 40 }, (_, i) => i), 'input untouched');
    assert.notDeepStrictEqual(out, src, 'actually shuffled');
});

// ── the board ────────────────────────────────────────────────────────────────
for (const [len, want] of Object.entries(BOARD_LENS)) {
    test(`makeBoard(${len}): the track is well formed`, () => {
        seedRng(4242);
        const b = makeBoard(len);
        const types = b.map(s => s.t);
        assert.strictEqual(types[0], 'start', 'starts at START');
        assert.strictEqual(types.filter(t => t === 'win').length, 1, 'exactly one trophy');
        assert.strictEqual(types.filter(t => t === 'finale').length, 1, 'exactly one Finale');
        assert.strictEqual(types.filter(t => t === 'fork').length, 1, 'exactly one fork');
        assert.ok(b.length >= want, `at least the requested ${want} squares (plus the short cut)`);
        b.forEach((s, i) => {
            assert.ok(Array.isArray(s.next) && s.next.length >= 1, `square ${i} has a next`);
            s.next.forEach(n => assert.ok(n >= 0 && n < b.length, `square ${i} points inside the board`));
        });
    });
}
test('makeBoard: the fork offers exactly two routes, and both rejoin the main path', () => {
    seedRng(11);
    const b = makeBoard('short');
    const fork = b.find(s => s.t === 'fork');
    assert.strictEqual(fork.next.length, 2, 'two ways on');
    assert.strictEqual((fork.routes || []).length, 2, 'and two labels for them');
    // walk the short cut to its end — it must land back on the main track
    let pos = fork.next[1], steps = 0;
    assert.ok(b[pos].sc, 'route 1 enters the short cut');
    while (b[pos].sc && steps++ < 20) pos = b[pos].next[0];
    assert.ok(!b[pos].sc, 'and comes back out');
    assert.ok(pos < b.findIndex(s => s.t === 'win'), 'rejoining before the trophy');
});
test('makeBoard: every square on the main path leads to the trophy', () => {
    seedRng(3);
    const b = makeBoard('normal');
    const winIx = b.findIndex(s => s.t === 'win');
    for (let start = 0; start < b.length; start++) {
        let pos = start, hops = 0;
        while (pos !== winIx && hops++ < b.length * 2) pos = b[pos].next[0];
        assert.strictEqual(pos, winIx, `square ${start} (${b[start].t}) reaches the trophy`);
    }
});
test('makeBoard: the trophy is the end of the line', () => {
    seedRng(5);
    const b = makeBoard('short');
    const winIx = b.findIndex(s => s.t === 'win');
    assert.deepStrictEqual(b[winIx].next, [winIx], 'you cannot walk off the end');
});
test('makeBoard: a seed reproduces the same board exactly', () => {
    seedRng(777); const a = JSON.stringify(makeBoard('short'));
    seedRng(777); assert.strictEqual(JSON.stringify(makeBoard('short')), a);
});
test('makeBoard: gates ask for a roll, traps and boosts carry a distance', () => {
    seedRng(21);
    const b = makeBoard('epic');
    b.filter(s => s.t === 'gate').forEach(s => assert.ok(s.need >= 2, 'a gate needs a number'));
    b.filter(s => s.t === 'boost').forEach(s => { assert.ok(s.n > 0, 'boosts push forward'); assert.ok(s.label, 'and say why'); });
    b.filter(s => s.t === 'trap').forEach(s => { assert.ok(s.n < 0, 'traps push back'); assert.ok(s.label, 'and say why'); });
});
test('makeBoard: an unknown length falls back to the short board', () => {
    seedRng(1);
    assert.ok(makeBoard('gigantic').length >= BOARD_LENS.short);
});

// ── laying the track out so it can be followed ───────────────────────────────
test('placeSquare: a run goes across, then ONE square drops vertically', () => {
    const first = placeSquare(0), lastOfRun = placeSquare(BOARD_RUN - 1), corner = placeSquare(BOARD_RUN);
    assert.deepStrictEqual([first.row, first.col], [1, 1], 'square 1 is top-left');
    assert.strictEqual(lastOfRun.row, 1, 'the run stays on one row');
    assert.strictEqual(lastOfRun.col, BOARD_RUN, 'and reaches the far side');
    assert.strictEqual(corner.row, 2, 'the corner square drops a row');
    assert.strictEqual(corner.col, BOARD_RUN, 'directly below the one before it');
});
test('placeSquare: the next run starts below the corner and goes back the other way', () => {
    const corner = placeSquare(BOARD_RUN);
    const nextRunStart = placeSquare(BOARD_RUN + 1);
    const nextRunSecond = placeSquare(BOARD_RUN + 2);
    assert.strictEqual(nextRunStart.col, corner.col, 'starts under the corner');
    assert.strictEqual(nextRunStart.row, corner.row + 1, 'one row further down');
    assert.ok(nextRunSecond.col < nextRunStart.col, 'and heads back the other way');
});
test('placeSquare: consecutive squares are always adjacent — no jumps', () => {
    for (let k = 0; k < 200; k++) {
        const a = placeSquare(k), b = placeSquare(k + 1);
        const dr = Math.abs(a.row - b.row), dc = Math.abs(a.col - b.col);
        assert.ok((dr === 0 && dc === 1) || (dr === 1 && dc === 0),
            `square ${k + 1}→${k + 2} jumped: (${a.row},${a.col})→(${b.row},${b.col})`);
    }
});
test('placeSquare: the arrow always points the way you actually go', () => {
    for (let k = 0; k < 120; k++) {
        const a = placeSquare(k), b = placeSquare(k + 1);
        if (a.dir === 'r') assert.strictEqual(b.col, a.col + 1, `k=${k} → says right`);
        else if (a.dir === 'l') assert.strictEqual(b.col, a.col - 1, `k=${k} → says left`);
        else if (a.dir === 'd') assert.strictEqual(b.row, a.row + 1, `k=${k} → says down`);
        else assert.fail(`k=${k} has no direction`);
    }
});
test('placeSquare: no two squares share a cell', () => {
    const seen = new Set();
    for (let k = 0; k < 300; k++) {
        const p = placeSquare(k), key = p.row + ':' + p.col;
        assert.ok(!seen.has(key), `square ${k + 1} lands on top of another at ${key}`);
        seen.add(key);
    }
});

// ── the die ──────────────────────────────────────────────────────────────────
test('PIPS: each face has the right number of dots, in a symmetric layout', () => {
    for (let v = 1; v <= 6; v++) {
        assert.ok(PIPS[v], `face ${v} exists`);
        assert.strictEqual(PIPS[v].length, v, `face ${v} has ${v} pips`);
        PIPS[v].forEach(i => assert.ok(i >= 0 && i < 9, 'pips sit in the 3×3 grid'));
        assert.strictEqual(new Set(PIPS[v]).size, v, 'no pip drawn twice');
    }
});
test('PIPS: odd faces use the centre, even faces never do', () => {
    for (const v of [1, 3, 5]) assert.ok(PIPS[v].includes(4), `face ${v} has a middle pip`);
    for (const v of [2, 4, 6]) assert.ok(!PIPS[v].includes(4), `face ${v} has no middle pip`);
});
test('FACE_ROT: every face has a rotation that brings it forward', () => {
    for (let v = 1; v <= 6; v++) {
        assert.ok(Array.isArray(FACE_ROT[v]), `face ${v}`);
        assert.strictEqual(FACE_ROT[v].length, 2, 'an X and a Y rotation');
        FACE_ROT[v].forEach(deg => assert.ok(Math.abs(deg) % 90 === 0, 'square angles only'));
    }
});
test('FACE_ROT: no two faces share a rotation', () => {
    const seen = new Set(Object.values(FACE_ROT).map(r => r.join(',')));
    assert.strictEqual(seen.size, 6, 'six distinct orientations');
});

// ── deck integrity: no card may quietly do nothing ───────────────────────────
const OP_KEYS = new Set();
[...ENGINE.matchAll(/\bo\.([a-zA-Z]+)/g)].forEach(m => OP_KEYS.add(m[1]));

test('every Gimmick has a title and readable text', () => {
    GIMMICKS.forEach(c => {
        assert.ok(c.t && c.t.length > 1, `title: ${JSON.stringify(c)}`);
        assert.ok(c.x && c.x.length > 5, `text for ${c.t}`);
        assert.ok(c.o && typeof c.o === 'object', `${c.t} has an effect`);
    });
});
test('every Gimmick op is one the engine actually implements', () => {
    // catches a typo'd key, which would leave a card that does nothing at all
    GIMMICKS.forEach(c => Object.keys(c.o).forEach(k => {
        assert.ok(OP_KEYS.has(k), `card "${c.t}" uses op "${k}", which applyOps never reads`);
    }));
});
test('Gimmick titles are unique (so the tests can stack the deck by name)', () => {
    const names = GIMMICKS.map(c => c.t);
    assert.strictEqual(new Set(names).size, names.length);
});
test('the deck has all three flavours, in sane proportions', () => {
    const dares = GIMMICKS.filter(c => c.o.dare).length;
    const holds = GIMMICKS.filter(c => c.o.hold).length;
    const moves = GIMMICKS.length - dares - holds;
    assert.ok(dares >= 8, `enough dares (${dares})`);
    assert.ok(holds >= 3, `enough keepable cards (${holds})`);
    assert.ok(moves >= 15, `enough board effects (${moves})`);
    assert.ok(dares / GIMMICKS.length < 0.5, 'but it is still a board game, not a dare game');
});
test('kept cards name a hold the engine knows how to play', () => {
    const played = new Set([...ENGINE.matchAll(/card\.hold === '([a-z]+)'/g)].map(m => m[1]));
    GIMMICKS.filter(c => c.o.hold).forEach(c => {
        assert.ok(played.has(c.o.hold) || c.o.hold === 'immune',
            `"${c.t}" is kept as "${c.o.hold}", which hostPlayCard never handles`);
    });
});
test('whammies are rare but present', () => {
    const rare = GIMMICKS.filter(c => c.w === 0);
    assert.ok(rare.length >= 4, 'some big swings exist');
    assert.ok(rare.length / GIMMICKS.length < 0.2, 'and they stay rare');
    rare.forEach(c => assert.strictEqual(c.t, c.t.toUpperCase(), `${c.t} SHOUTS, so the room knows`));
});
test('every Finale kind is one runFinale handles', () => {
    const handled = new Set([...ENGINE.matchAll(/case '([a-z0-9]+)':/g)].map(m => m[1]));
    FINALES.forEach(f => {
        assert.ok(f.t && f.x, `${JSON.stringify(f)} is described`);
        assert.ok(handled.has(f.k), `Finale "${f.t}" has kind "${f.k}", which runFinale never handles`);
    });
});
test('the Finale deck covers instant wins, mini-games and endgame changes', () => {
    const kinds = new Set(FINALES.map(f => f.k));
    assert.ok(['now', 'all', 'notlast', 'pity'].some(k => kinds.has(k)), 'something resolves instantly');
    assert.ok(['rps', 'vote', 'guess', 'dice', 'coin'].some(k => kinds.has(k)), 'something is a mini-game');
    assert.ok(['race', 'roll6', 'toll'].some(k => kinds.has(k)), 'something sends you back to the board');
    assert.ok(FINALES.length >= 10, 'enough variety that the ending is a surprise');
});
test('every Build rule is one the engine actually checks for', () => {
    const used = new Set([...ENGINE.matchAll(/H\.build\.b === '([a-z0-9]+)'/g)].map(m => m[1]));
    BUILDS.forEach(b => {
        assert.ok(b.t && b.x, `${JSON.stringify(b)} is described`);
        assert.ok(used.has(b.b), `Build "${b.t}" sets "${b.b}", which nothing in the engine reads`);
    });
});
test('Build ids and titles are unique', () => {
    assert.strictEqual(new Set(BUILDS.map(b => b.b)).size, BUILDS.length);
    assert.strictEqual(new Set(BUILDS.map(b => b.t)).size, BUILDS.length);
});
test('no card text shouts about a platform we do not have', () => {
    // the original deck was full of Steam/Discord/app tasks; ours must stay phone-safe
    const banned = /steam|discord|instagram|\bvc\b|download|typingtest|wheelofnames/i;
    [...GIMMICKS, ...FINALES, ...BUILDS].forEach(c => {
        assert.ok(!banned.test(c.x), `"${c.t}" asks for something off-platform: ${c.x}`);
    });
});
