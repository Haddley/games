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
const { placeSquare, BOARD_RUN } = new Function([
    grab('const BOARD_RUN', ';'),
    grab('function placeSquare(k) {', '\n}'),
    'return { placeSquare, BOARD_RUN };',
].join('\n'))();
// the die itself is dice.js now — see unit/dice.test.js

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

// ═══════════════════════════════════════════════════════════════════════════════
// THE TREKKERS — the sprite pieces
// ═══════════════════════════════════════════════════════════════════════════════
// The pieces are frames off `sprites/trekkers.png`, so the numbers that index that sheet
// are load-bearing: a row of 5 and a column of 7. Get one wrong and the board shows half
// a duck. These tests hold the sheet's shape and the pile geometry to account.
const TOKENS = new Function([
    grab('const TREK_CAST = [', '];'),
    grab('const PAWN_COLS = TREK_CAST', ';'),
    grab('const AUTO_SEATS', ';'),
    grab('function nameSeed(pl) {', '\n}'),
    grab('function castOf(pl) {', '\n}'),
    grab('function pawnColor(pl)', '}'),
    grab('function tokenScale(n)', '}'),
    grab('function tokenCols(n)', '}'),
    grab('function tokenStep(n)', '}'),
    grab('const IDLES = [', '];'),
    grab('const EMO = {', '};'),
    grab('const IDLE_EMOTES = [', '];'),
    grab('function idleOf(pl)', '}'),
    grab('function beatOf(pl)', '}'),
    'const POSE = ' + /const POSE = (\{[^}]*\})/.exec(SCRIPT)[1] + ';',
    'return { TREK_CAST, PAWN_COLS, AUTO_SEATS, castOf, pawnColor, tokenScale, tokenCols, tokenStep,',
    '         IDLES, EMO, IDLE_EMOTES, idleOf, beatOf, nameSeed, POSE };',
].join('\n'))();
const AUTO = TOKENS.AUTO_SEATS;

test('every piece in the cast is a real window onto the sheet', () => {
    const { TREK_CAST } = TOKENS;
    TREK_CAST.forEach(([row, hue, col], i) => {
        assert.ok(Number.isInteger(row) && row >= 0 && row <= 4,
            `seat ${i} sits on sheet row ${row}; the sheet only has rows 0–4`);
        assert.ok(hue >= 0 && hue < 360, `seat ${i} has a nonsense hue: ${hue}`);
        assert.match(col, /^#[0-9a-f]{6}$/, `seat ${i} needs a real hex colour`);
    });
    // no two pieces are the same character in the same colour
    const combos = TREK_CAST.map(c => c[0] + ':' + c[1]);
    assert.strictEqual(new Set(combos).size, TREK_CAST.length, 'two pieces share a character AND a hue');
    assert.strictEqual(new Set(TOKENS.PAWN_COLS).size, TREK_CAST.length, 'two pieces share a colour');
});

test('a seat colour picks the piece; an unknown one still gets a piece', () => {
    const { castOf, PAWN_COLS, TREK_CAST } = TOKENS;
    PAWN_COLS.forEach((col, i) => {
        assert.deepStrictEqual(castOf({ name: 'Ada', col }), TREK_CAST[i],
            'the host-assigned colour must decide the piece, not the name');
    });
    // an old snapshot with no colour, or a colour we do not know, must not crash
    const fallback = castOf({ name: 'Ada' });
    assert.ok(TREK_CAST.includes(fallback));
    assert.ok(TREK_CAST.includes(castOf({ name: 'Bo', col: '#123456' })));
    // and the same player always gets the same piece
    assert.deepStrictEqual(castOf({ name: 'Ada' }), castOf({ name: 'Ada' }));
});

test('the colour on the piece is the colour in the rail', () => {
    const { pawnColor, PAWN_COLS } = TOKENS;
    PAWN_COLS.forEach(col => assert.strictEqual(pawnColor({ name: 'x', col }), col));
    assert.match(pawnColor({ name: 'Nameless' }), /^#[0-9a-f]{6}$/);
});

test('a pile stays short enough to read: every face shows, nothing hits the next row', () => {
    const { tokenStep, tokenScale, tokenCols } = TOKENS;
    for (let n = 1; n <= 12; n++) {
        const step = tokenStep(n), scale = tokenScale(n), cols = tokenCols(n);
        const per = Math.ceil(n / cols);
        // a token is 4.4vmin against a ~8.4vmin square → 52% of a square, times its scale
        const tokPct = 52 * scale;
        // THE FACE TEST: the step must clear a helmet (~45% of the sprite), or the piece
        // above plants its feet on the face below — the thing that made the first pile
        // unreadable.
        if (n > 1) assert.ok(step >= 0.45 * tokPct * 0.95,
            `${n} in a pile: a ${step}% step does not clear a ${(0.45 * tokPct).toFixed(1)}% helmet`);
        // THE HEIGHT TEST: the tower must not climb into the row above it.
        const pileH = tokPct + (per - 1) * step;
        assert.ok(pileH <= 175, `${n} in a pile is ${pileH.toFixed(0)}% of a square tall`);
        // and the towers must fit side by side on one square
        assert.ok(cols * tokPct * 0.82 <= 130, `${n} in a pile is too wide`);
    }
    assert.strictEqual(tokenCols(4), 1, 'four still stack as one tower');
    assert.strictEqual(tokenCols(5), 2, 'five splits, or the tower gets silly');
});

test('every player is dealt an idle and an emote, always the same one', () => {
    const { idleOf, IDLES, IDLE_EMOTES, EMO, beatOf } = TOKENS;
    assert.strictEqual(IDLES.length, 6);
    IDLES.forEach(c => assert.match(c, /^i-[a-z]+$/));
    // the idle emotes are all real columns of emotes.png
    IDLE_EMOTES.forEach(e => assert.ok(Number.isInteger(e) && e >= 0 && e <= 11, `emote ${e} is off the sheet`));
    assert.strictEqual(Object.keys(EMO).length, 12, 'twelve balloons on the sheet, twelve names');
    Object.entries(EMO).forEach(([k, v]) => assert.ok(v >= 0 && v <= 11, `${k} is off the sheet`));
    assert.strictEqual(new Set(Object.values(EMO)).size, 12, 'two names point at one balloon');
    // stable, and spread across the six idles for a normal set of names
    const names = ['Ace', 'Bux', 'Cass', 'Duke', 'Edie', 'Fox', 'Gus', 'Hal', 'Ivy', 'Jo', 'Kit', 'Lex'];
    names.forEach(n => assert.strictEqual(idleOf({ name: n }), idleOf({ name: n })));
    const kinds = new Set(names.map(n => idleOf({ name: n })));
    assert.ok(kinds.size >= 4, `twelve players only got ${kinds.size} distinct idles`);
    // the beat is a real CSS time, so the rail and the board tick together
    names.forEach(n => assert.match(beatOf({ name: n }), /^\d+(\.\d+)?s$/));
});

test('every reaction pose is a real column of the sprite sheet, or a named loop', () => {
    const { POSE } = TOKENS;
    const frames = Object.values(POSE).filter(v => typeof v === 'number');
    const loops = Object.values(POSE).filter(v => typeof v === 'string');
    frames.forEach(v => assert.ok(Number.isInteger(v) && v >= 0 && v <= 8,
        `pose frame ${v} is off the sheet; it has frames 0–8`));
    // the two walk frames are reserved for walking, and idle is the resting frame
    assert.ok(!frames.includes(1) && !frames.includes(2),
        'frames 1 and 2 are the walk cycle — a reaction must not squat on them');
    assert.ok(!frames.includes(0), 'frame 0 is the resting pose, not a reaction');
    // a named pose is a looping animation, and it must have a class and keyframes behind it
    loops.forEach(name => {
        assert.match(HTML, new RegExp('\\.trk\\.' + (name === 'climb' ? 'strain' : name) + '\\s*\\{'),
            `pose "${name}" has no CSS class`);
    });
    assert.ok(loops.includes('climb'), 'the climb frames should be in use, not left in the zip');
    assert.match(HTML, /@keyframes spClimb/, 'and the climb loop needs keyframes');
    // and every one of the nine frames the sheet carries is used SOMEWHERE
    const used = new Set(frames);
    used.add(0); used.add(1); used.add(2);                 // idle + the walk cycle
    [7, 8].forEach(f => used.add(f));                      // the climb loop
    assert.strictEqual(used.size, 9, `only ${used.size} of the nine frames are used`);
});

test('the CSS windows onto the sheets match the sheets we actually ship', () => {
    // 7 poses × 5 characters, and 12 balloons in one row. If the sheet is ever rebuilt with
    // a different layout, these are the two numbers that have to change with it.
    assert.match(HTML, /background-size: 900% 500%;/, 'trekkers.png is 9 poses × 5 characters');
    assert.match(HTML, /background-size: 1200% 100%;/, 'emotes.png is 12 balloons in a row');
    assert.match(HTML, /var\(--f, 0\) \* 100% \/ 8/, 'frame step is 100%/8 for 9 columns');
    assert.match(HTML, /var\(--row, 0\) \* 25%/, 'character step is 25% for 5 rows');
    assert.match(HTML, /var\(--e, 0\) \* 100% \/ 11/, 'balloon step is 100%/11 for 12 columns');
    // the ?v= token encodes the GRID: bump it whenever a sheet is rebuilt with a different
    // number of rows or columns, or cached copies render each window across two frames
    assert.match(HTML, /url\(sprites\/trekkers\.png\?v=9x5\)/, 'trekkers.png must be versioned 9x5');
    assert.match(HTML, /url\(sprites\/emotes\.png\?v=12x1\)/, 'emotes.png must be versioned 12x1');
    // and the token has to agree with the background-size it is documenting
    const cols = +/background-size: (\d+)00% (\d+)00%;/.exec(HTML.slice(HTML.indexOf('.trk {')))[1];
    const rows = +/background-size: (\d+)00% (\d+)00%;/.exec(HTML.slice(HTML.indexOf('.trk {')))[2];
    assert.match(HTML, new RegExp('trekkers\\.png\\?v=' + cols + 'x' + rows),
        `the ?v= token must match the ${cols}×${rows} grid the CSS windows onto`);
});

test('the sprite sheets are in the repo, with their licences', () => {
    const root = path.join(__dirname, '..');
    for (const f of ['sprites/trekkers.png', 'sprites/emotes.png', 'sprites/CREDITS.md',
                     'sprites/build-sheets.py', 'sprites/licenses/CC0-1.0.txt',
                     'sprites/licenses/kenney_new-platformer-pack_License.txt',
                     'sprites/licenses/kenney_emotes-pack_License.txt']) {
        assert.ok(fs.existsSync(path.join(root, f)), `${f} is missing`);
    }
    // the upstream licence really does say CC0 — this is the compliance evidence
    const up = fs.readFileSync(path.join(root, 'sprites/licenses/kenney_new-platformer-pack_License.txt'), 'utf8');
    assert.match(up, /Creative Commons Zero, CC0/i);
    assert.match(fs.readFileSync(path.join(root, 'sprites/licenses/CC0-1.0.txt'), 'utf8'), /CC0 1\.0 Universal/);
    // and CREDITS.md records where each sheet came from, byte-for-byte
    const cred = fs.readFileSync(path.join(root, 'sprites/CREDITS.md'), 'utf8');
    assert.match(cred, /553b907f3f0e505ab65f56f245ccaff3123c8fe3f3a0dfce9373b996bfc18cc2/, 'the character pack hash');
    assert.match(cred, /96ab3f2c92d7acd860942efca1c9f1295184b11d3db5c79c28da82036e496526/, 'the emotes pack hash');
    assert.match(cred, /kenney\.nl/);
});

test('a frame index is never a fraction — every animation lands on a whole frame', () => {
    // The idles move `background-position-x` directly, so every value in those keyframes
    // has to be one of the seven frame positions. A stray 20% would show two half-ducks.
    const css = HTML.slice(HTML.indexOf('.i-shuffle'), HTML.indexOf('.trk.rx'));
    const frames = [0, 1, 2, 3, 4, 5, 6, 7, 8].map(f => +(f * 100 / 8).toFixed(3));
    const literals = [...css.matchAll(/background-position-x: (-?[\d.]+)%/g)].map(m => +m[1]);
    assert.ok(literals.length >= 6, 'the idles should be setting frames');
    literals.forEach(v => {
        assert.ok(frames.some(f => Math.abs(f - v) < 0.02),
            `${v}% is between frames; the whole-frame positions are ${frames.join('%, ')}%`);
    });
    // …and the ones written as calc(100% / 6) style are whole frames by construction
    const calcs = [...css.matchAll(/background-position-x: calc\((\d+)% \/ 8\)/g)].map(m => +m[1] / 100);
    calcs.forEach(f => assert.ok(Number.isInteger(f) && f <= 8, `calc(${f * 100}% / 8) is not a frame`));
});

// ═══════════════════════════════════════════════════════════════════════════════
// MOOD — how the trekker is feeling
// ═══════════════════════════════════════════════════════════════════════════════
// A reaction with no memory reads as a machine: trapped three turns running and you'd
// flinch identically each time. So each trekker carries a running mood, and the same event
// reads differently depending on the mood it lands on. This is a table of frames, so the
// integrity tests are the same shape as the card-deck ones: every number must index a real
// column of a real sheet, and every event the engine can raise must have a reaction.
const MOODS = new Function([
    'const POSE = ' + /const POSE = (\{[^}]*\})/.exec(SCRIPT)[1] + ';',
    grab('const EMO = {', '};'),
    grab('const IDLE_EMOTES = [', '];'),
    grab('const MOOD_CAP', ';'),
    grab('const MOOD_DELTA', ';'),
    grab('function moodOf(id)', '}'),
    grab('function moodBucket(m)', '}'),
    grab('const MOOD = {}', ';'),
    grab('function bumpMood(id, kind) {', '\n}'),
    grab('function fadeMood(id) {', '\n}'),
    grab('function resetMoods()', '); }'),   // NB: '}' alone would cut at the arrow's brace
    grab('const MOOD_LOOK = {', '\n};'),
    grab('const REACTIONS = {', '\n};'),
    grab('function reactionFor(kind, mood) {', '\n}'),
    'return { MOOD, MOOD_CAP, MOOD_DELTA, MOOD_LOOK, REACTIONS, EMO, POSE, IDLE_EMOTES,',
    '         moodOf, moodBucket, bumpMood, fadeMood, resetMoods, reactionFor };',
].join('\n'))();

test('mood runs from thoroughly fed up to having a wonderful time, and stops there', () => {
    const { bumpMood, moodOf, resetMoods, MOOD_CAP } = MOODS;
    resetMoods();
    assert.strictEqual(moodOf('nobody'), 0, 'an unknown player is neutral, not undefined');
    for (let i = 0; i < 20; i++) bumpMood('a', 'back');
    assert.strictEqual(moodOf('a'), -MOOD_CAP, 'misery bottoms out');
    for (let i = 0; i < 40; i++) bumpMood('a', 'home');
    assert.strictEqual(moodOf('a'), MOOD_CAP, 'and joy tops out');
    resetMoods();
    assert.strictEqual(moodOf('a'), 0, 'a new game wipes the slate');
});

test('mood fades one step at a time, toward neutral from either side', () => {
    const { bumpMood, fadeMood, moodOf, resetMoods } = MOODS;
    resetMoods();
    bumpMood('sad', 'back'); bumpMood('sad', 'back');       // −3 (capped from −4)
    const start = moodOf('sad');
    assert.ok(start < 0);
    const seen = [start];
    for (let i = 0; i < 6; i++) { fadeMood('sad'); seen.push(moodOf('sad')); }
    // strictly toward zero, one step per turn, and it stays there
    for (let i = 1; i < seen.length; i++) {
        assert.ok(Math.abs(seen[i]) <= Math.abs(seen[i - 1]), `mood jumped away from neutral: ${seen}`);
        assert.ok(Math.abs(seen[i] - seen[i - 1]) <= 1, `mood faded more than one step: ${seen}`);
    }
    assert.strictEqual(seen[seen.length - 1], 0, `never settled: ${seen}`);
    assert.ok(seen.filter(v => v !== 0).length >= 2, 'a bad break should sour you for more than one turn');

    resetMoods();
    bumpMood('glad', 'home');
    for (let i = 0; i < 6; i++) fadeMood('glad');
    assert.strictEqual(moodOf('glad'), 0, 'good moods fade too');
});

test('the buckets are five, in order, and cover every possible mood', () => {
    const { moodBucket, MOOD_CAP } = MOODS;
    const order = ['glum', 'down', 'ok', 'chuffed', 'elated'];
    const seen = [];
    for (let m = -MOOD_CAP; m <= MOOD_CAP; m++) {
        const b = moodBucket(m);
        assert.ok(order.includes(b), `mood ${m} produced unknown bucket "${b}"`);
        if (b !== seen[seen.length - 1]) seen.push(b);
    }
    assert.deepStrictEqual(seen, order, 'the buckets must run glum → elated with no gaps');
    assert.strictEqual(moodBucket(0), 'ok');
    assert.strictEqual(moodBucket(-1), 'down');
    assert.strictEqual(moodBucket(1), 'chuffed');
});

test('a fed-up trekker is slower, duller and more slumped than a delighted one', () => {
    const { MOOD_LOOK } = MOODS;
    const order = ['glum', 'down', 'ok', 'chuffed', 'elated'];
    order.forEach(k => assert.ok(MOOD_LOOK[k], `no look for "${k}"`));
    const get = (k, f) => MOOD_LOOK[k][f];
    for (let i = 1; i < order.length; i++) {
        const a = order[i - 1], b = order[i];
        assert.ok(get(a, 'mf') > get(b, 'mf'), `${a} should move slower than ${b}`);
        assert.ok(get(a, 'tilt') > get(b, 'tilt'), `${a} should lean further forward than ${b}`);
        assert.ok(get(a, 'slump') > get(b, 'slump'), `${a} should sag more than ${b}`);
        assert.ok(get(a, 'sat') < get(b, 'sat'), `${a} should be duller than ${b}`);
        assert.ok(get(a, 'bri') <= get(b, 'bri'), `${a} should be no brighter than ${b}`);
    }
    // neutral is the untouched baseline, so a player with nothing to feel looks like themselves
    ['mf', 'sat', 'bri'].forEach(f => assert.strictEqual(get('ok', f), 1, `neutral must not change ${f}`));
    ['tilt', 'slump'].forEach(f => assert.strictEqual(get('ok', f), 0, `neutral must not change ${f}`));
    assert.strictEqual(MOOD_LOOK.ok.emotes, null, 'a neutral trekker keeps the emote their name dealt them');
    // strong feelings are aired more often than mild ones
    assert.ok(MOOD_LOOK.glum.every < MOOD_LOOK.ok.every, 'a miserable trekker sighs more often');
    assert.ok(MOOD_LOOK.elated.every < MOOD_LOOK.ok.every, 'a delighted one beams more often');
});

test('every mood look and every reaction indexes a real frame', () => {
    const { MOOD_LOOK, REACTIONS, EMO, POSE } = MOODS;
    const emotes = new Set(Object.values(EMO));
    const poses = new Set(Object.values(POSE));
    Object.entries(MOOD_LOOK).forEach(([k, v]) => {
        (v.emotes || []).forEach(e => assert.ok(emotes.has(e), `${k} sighs balloon ${e}, which isn't on the sheet`));
    });
    Object.entries(REACTIONS).forEach(([kind, byMood]) => {
        Object.entries(byMood).forEach(([mood, r]) => {
            const [emote, pose, hold] = r;
            assert.ok(emotes.has(emote), `${kind}/${mood} pops balloon ${emote}, which isn't on the sheet`);
            assert.ok(pose === null || poses.has(pose), `${kind}/${mood} holds "${pose}", which isn't a pose`);
            assert.ok(hold >= 0 && hold <= 2500, `${kind}/${mood} holds for ${hold}ms — too long to be a reaction`);
            if (pose === null) assert.strictEqual(hold, 0, `${kind}/${mood} has no pose, so it needs no hold`);
            else assert.ok(hold > 0, `${kind}/${mood} holds a pose for no time at all`);
        });
    });
});

test('every event the engine can raise has a reaction, and every reaction an event', () => {
    // The same integrity idea as the card decks: a typo'd event key would silently do
    // nothing in a real game, and no other test would notice.
    const { REACTIONS, MOOD_DELTA } = MOODS;
    const raised = new Set([...SCRIPT.matchAll(/hit\(\s*[^,]+,\s*'([a-z]+)'\s*\)/g)].map(m => m[1]));
    const pushed = new Set([...SCRIPT.matchAll(/events\.push\(\[[^,]+, c\.dare \? '([a-z]+)' : '([a-z]+)'/g)]
        .flatMap(m => [m[1], m[2]]));
    const all = new Set([...raised, ...pushed]);
    assert.ok(all.size >= 8, `only found ${all.size} events — has moodPass changed shape?`);
    all.forEach(k => assert.ok(REACTIONS[k], `the engine raises "${k}" but nothing reacts to it`));
    Object.keys(REACTIONS).forEach(k => assert.ok(all.has(k), `REACTIONS has "${k}", which nothing ever raises`));
    // the mood deltas describe the same world (the two 'told'/'dare' cases are pure reaction)
    Object.keys(MOOD_DELTA).forEach(k => assert.ok(REACTIONS[k], `MOOD_DELTA has "${k}" with no reaction`));
    // good news lifts, bad news sinks — none of them are accidentally zero
    ['home', 'boost', 'lead', 'card'].forEach(k => assert.ok(MOOD_DELTA[k] > 0, `${k} should cheer you up`));
    ['back', 'skip', 'gate', 'slip'].forEach(k => assert.ok(MOOD_DELTA[k] < 0, `${k} should get you down`));
});

test('the same event reads differently depending on how you already felt', () => {
    const { reactionFor } = MOODS;
    // being sent backwards: a sulk when you were already miserable, indignation when flying
    const sulk = reactionFor('back', -3), cross = reactionFor('back', 0), startled = reactionFor('back', 3);
    assert.notDeepStrictEqual(sulk, cross, 'a trap should not read the same to a glum trekker');
    assert.notDeepStrictEqual(cross, startled, '…nor the same to an elated one');
    assert.ok(sulk[2] > cross[2], 'and the sulk lasts longer than the flinch');
    // a boost when you are down is relief, not a victory dance
    assert.notDeepStrictEqual(reactionFor('boost', -3), reactionFor('boost', 3));
    // the in-between moods borrow the nearer extreme rather than falling through to neutral
    assert.deepStrictEqual(reactionFor('back', -1), reactionFor('back', -3), 'down leans glum');
    assert.deepStrictEqual(reactionFor('back', 1), reactionFor('back', 3), 'chuffed leans elated');
    // and nothing ever returns undefined for a real event
    Object.keys(MOODS.REACTIONS).forEach(k => {
        for (let m = -3; m <= 3; m++) {
            const r = reactionFor(k, m);
            assert.ok(Array.isArray(r) && r.length === 3, `reactionFor(${k}, ${m}) gave ${JSON.stringify(r)}`);
        }
    });
    assert.strictEqual(reactionFor('nonsense', 0), null, 'an unknown event reacts with nothing, not a crash');
});

test('the reaction reads the mood the event LANDED ON, not the one it leaves behind', () => {
    // moodPass records the pre-event mood alongside each event for exactly this reason. If
    // it read the mood afterwards, a single trap would sour you to glum and then be played
    // as a glum trekker's sulk — so the first knock could never read as a fresh knock.
    const src = grab('function moodPass(before, after) {', '\n}');
    assert.match(src, /events\.push\(\[id, kind, moodOf\(id\)\]\);\s*bumpMood/,
        'moodPass must snapshot the mood BEFORE bumping it');
    const play = grab('function playReactions(events) {', '\n}');
    assert.match(play, /\[id, kind, mood\]/, 'playReactions must use the mood carried on the event');
});

test('there are thirty pieces to choose from, and twelve handed out automatically', () => {
    const { TREK_CAST } = TOKENS;
    assert.strictEqual(TREK_CAST.length, 30, 'thirty on the picker makes a collision unlikely');
    assert.strictEqual(AUTO, 12, 'twelve auto-assigned — one per seat at a full table');
    assert.ok(AUTO <= TREK_CAST.length);
    // the auto-assigned twelve are the well-spread ones: no two closer than 15° of hue
    const hueOf = hex => {
        const [r, g, b] = [1, 3, 5].map(i => parseInt(hex.substr(i, 2), 16) / 255);
        const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
        if (!d) return 0;
        const h = mx === r ? (g - b) / d % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
        return (h * 60 + 360) % 360;
    };
    // PAIRWISE, not consecutive: the host draws from this pool at random, so any two of
    // them can end up side by side on the board.
    const auto = TREK_CAST.slice(0, AUTO).map(c => hueOf(c[2]));
    for (let i = 0; i < auto.length; i++) {
        for (let j = i + 1; j < auto.length; j++) {
            const d = Math.min(Math.abs(auto[i] - auto[j]), 360 - Math.abs(auto[i] - auto[j]));
            assert.ok(d >= 14, `auto-seats ${i} and ${j} are only ${d.toFixed(0)}° apart`);
        }
    }
    // …and no more than three of any one character among them, so it isn't twelve ducks
    const counts = {};
    TREK_CAST.slice(0, AUTO).forEach(c => { counts[c[0]] = (counts[c[0]] || 0) + 1; });
    Object.entries(counts).forEach(([row, n]) =>
        assert.ok(n <= 3, `character ${row} fills ${n} of the twelve auto seats`));
    // every one of the five characters appears somewhere in the thirty, at six hues each
    const byRow = {};
    TREK_CAST.forEach(([row, hue]) => { (byRow[row] = byRow[row] || []).push(hue); });
    assert.strictEqual(Object.keys(byRow).length, 5, 'all five characters are used');
    Object.entries(byRow).forEach(([row, hues]) => {
        assert.strictEqual(hues.length, 6, `character ${row} should appear at six hues`);
        assert.strictEqual(new Set(hues).size, 6, `character ${row} repeats a hue`);
    });
});

test('the shipped sheets are the ones CREDITS.md vouches for', () => {
    // Chain of custody in both directions: CREDITS.md records the SHA-256 of the upstream
    // zips AND of the two PNGs we derived from them. If a sheet is rebuilt, both this test
    // and the ?v= token have to be updated deliberately — which is the point.
    const crypto = require('node:crypto');
    const root = path.join(__dirname, '..');
    const cred = fs.readFileSync(path.join(root, 'sprites/CREDITS.md'), 'utf8');
    for (const f of ['trekkers.png', 'emotes.png']) {
        const sum = crypto.createHash('sha256')
            .update(fs.readFileSync(path.join(root, 'sprites', f))).digest('hex');
        assert.ok(cred.includes(sum),
            `sprites/${f} hashes to ${sum}, which CREDITS.md does not record — rebuild the docs`);
    }
});
