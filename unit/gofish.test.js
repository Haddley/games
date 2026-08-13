// Unit tests for Go Fish's pure card/book logic and the host ask-resolution engine —
// `npm run test:unit`, no browser. `hostAsk`/`advanceTurn`/`hostStartGame` reference
// `capPlayer()` and `broadcast()`, which live in the connection section of the file and
// depend on network globals — those are passed in as stubs here, exactly the pattern
// `unit/plumptrek.test.js` and `unit/kingscorner`-style slices use elsewhere in this repo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'gofish.html'), 'utf8');

const SRC = (() => {
    const a = HTML.indexOf("const PFX = 'GOFISH-';");
    const b = HTML.indexOf('// MESSAGES / DISPLAY', a);
    assert.ok(a >= 0 && b > a, 'could not slice the constants/card/book/host-logic block out of gofish.html');
    return HTML.slice(a, b);
})();

// A fresh engine per test: `capPlayer` always says the first player may act as captain,
// `broadcast` is a no-op (each test reads `H` directly afterward, same as the real host does).
function makeEngine() {
    const capPlayer = () => H.players[0] || null;
    const broadcast = () => {};
    const fn = new Function('capPlayer', 'broadcast',
        SRC + '\nreturn { H, hostAddPlayer, hostStartGame, hostPlayAgain, hostCtl, advanceTurn, hostAsk, layBooks, makeCard, checkMatchOver, refillIfEmpty };');
    return fn(capPlayer, broadcast);
}

const c = (rank, suit) => ({ rank, suit, id: rank + suit });

test('layBooks: lays down exactly a complete rank, leaves partial ranks alone', () => {
    const E = makeEngine();
    const p = { hand: [c(7, 'S'), c(7, 'H'), c(7, 'D'), c(7, 'C'), c(2, 'S'), c(2, 'H')], books: [] };
    const laid = E.layBooks(p);
    assert.deepEqual(laid, [7]);
    assert.equal(p.hand.length, 2, 'the two leftover 2s stay in hand');
    assert.ok(p.hand.every(card => card.rank === 2));
    assert.deepEqual(p.books, [7]);
});

test('layBooks: no-op on a hand with nothing complete', () => {
    const E = makeEngine();
    const p = { hand: [c(7, 'S'), c(7, 'H'), c(7, 'D'), c(2, 'S')], books: [] };
    assert.deepEqual(E.layBooks(p), []);
    assert.equal(p.hand.length, 4);
});

test('layBooks: can lay down more than one book at once (e.g. a fresh deal)', () => {
    const E = makeEngine();
    const p = {
        hand: [c(7, 'S'), c(7, 'H'), c(7, 'D'), c(7, 'C'), c(2, 'S'), c(2, 'H'), c(2, 'D'), c(2, 'C')],
        books: [],
    };
    const laid = E.layBooks(p).sort();
    assert.deepEqual(laid, [2, 7]);
    assert.equal(p.hand.length, 0);
});

test('hostAsk: asking for a rank you do not hold is illegal and does nothing', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(3, 'S')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.hostAsk('a', 'b', 7);   // Ann has no 7s
    assert.equal(E.H.players[0].hand.length, 1, 'nothing changed — the ask was illegal');
    assert.equal(E.H.players[1].hand.length, 1);
    assert.equal(E.H.turnIdx, 0, 'turn did not even advance — the message was simply refused');
});

test('hostAsk: a hit transfers every card of that rank and the asker goes again', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(7, 'S')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H'), c(7, 'D'), c(2, 'C')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.hostAsk('a', 'b', 7);
    assert.deepEqual(E.H.players[0].hand.map(x => x.id).sort(), ['7D', '7H', '7S']);
    assert.deepEqual(E.H.players[1].hand.map(x => x.id), ['2C']);
    assert.equal(E.H.turnIdx, 0, "asker's turn continues — a hit never advances turnIdx");
});

test('hostAsk: a hit that completes a book lays it down immediately', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(7, 'S'), c(7, 'C')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H'), c(7, 'D')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0; E.H.booksClaimed = 0;
    E.hostAsk('a', 'b', 7);
    assert.deepEqual(E.H.players[0].books, [7]);
    assert.equal(E.H.players[0].hand.length, 0);
    assert.equal(E.H.booksClaimed, 1);
});

test('hostAsk: a miss with no matching draw passes the turn ("Go Fish")', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(7, 'S')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(2, 'H')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.stock = [c(9, 'D')];   // the only card left to draw does NOT match the asked rank (7)
    E.hostAsk('a', 'b', 7);
    assert.equal(E.H.stock.length, 0, 'the stock card was drawn');
    assert.ok(E.H.players[0].hand.some(x => x.id === '9D'), 'the drawn card joined the hand');
    assert.equal(E.H.turnIdx, 1, "a non-matching fish passes the turn to Bo");
});

test('hostAsk: a miss whose drawn card MATCHES the ask lets the asker go again', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(7, 'S')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(2, 'H')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.stock = [c(7, 'D')];   // fishes up exactly the rank asked for
    E.hostAsk('a', 'b', 7);
    assert.equal(E.H.turnIdx, 0, 'matched the fish — same player goes again');
    assert.ok(E.H.players[0].hand.some(x => x.id === '7D'));
});

test('hostAsk: a miss with an empty stock still passes the turn cleanly', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(7, 'S')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(2, 'H')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.stock = [];
    E.hostAsk('a', 'b', 7);
    assert.equal(E.H.turnIdx, 1);
    assert.equal(E.H.players[0].hand.length, 1, 'nothing to draw, hand unchanged');
});

test('advanceTurn: an empty-handed player with cards left in stock auto-draws one, and that becomes their whole hand', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(5, 'H')], books: [], spectating: false },
    ];
    E.H.stock = [c(9, 'C')];
    E.advanceTurn(1);   // Bo just finished — walk forward to Ann
    assert.equal(E.H.turnIdx, 0, "lands on Ann, not skipped, since the stock could refill her");
    assert.deepEqual(E.H.players[0].hand.map(x => x.id), ['9C']);
    assert.equal(E.H.stock.length, 0);
});

test('advanceTurn: an empty-handed player with an empty stock is skipped ("out of the game")', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(5, 'H')], books: [], spectating: false },
        { id: 'c', name: 'Cy', hand: [c(9, 'C')], books: [], spectating: false },
    ];
    E.H.stock = [];
    E.advanceTurn(1);   // Bo just finished — Ann is out, so Cy should get the turn instead
    assert.equal(E.H.turnIdx, 2);
});

test('checkMatchOver: ends the match the instant the 13th book lands', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.booksClaimed = 12;
    E.H.players = [{ id: 'a', name: 'Ann', hand: [c(7, 'S'), c(7, 'C')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H'), c(7, 'D')], books: [], spectating: false }];
    E.H.turnIdx = 0;
    E.hostAsk('a', 'b', 7);   // this hit completes the 13th book
    assert.equal(E.H.booksClaimed, 13);
    assert.equal(E.H.phase, 'match_over');
});

// ── regression: a book completed mid-"go again" turn must never softlock the room ──
// Found in testing: a player's hand can reach exactly 0 as a SIDE EFFECT of completing a
// book on a turn they're still holding (a hit, or a matched fish) — not just when a fresh
// turn is handed to them. Before the fix, that left `H.turnIdx` pointing at a player with an
// empty hand and no legal rank to ask for; the UI disables every rank chip on an empty hand,
// so they could never send another message and the room froze.

test('hostAsk (hit): completing a book down to an empty hand auto-draws so the SAME turn can continue', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        // Ann's entire hand is three 7s — a hit that completes the book empties her hand.
        { id: 'a', name: 'Ann', hand: [c(7, 'S'), c(7, 'C'), c(7, 'D')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H'), c(2, 'C')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.stock = [c(9, 'D')];   // a card left to auto-draw
    E.hostAsk('a', 'b', 7);
    assert.deepEqual(E.H.players[0].books, [7], 'the book of sevens laid down');
    assert.equal(E.H.turnIdx, 0, "it is still Ann's turn — a hit never advances turnIdx");
    assert.equal(E.H.players[0].hand.length, 1, 'her empty hand was auto-refilled from the stock');
    assert.equal(E.H.players[0].hand[0].id, '9D');
    assert.equal(E.H.stock.length, 0);
});

test('hostAsk (hit): completing a book with an empty stock and an empty hand passes the turn instead of softlocking', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(7, 'S'), c(7, 'C'), c(7, 'D')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H'), c(2, 'C')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.stock = [];   // nothing to auto-draw
    E.hostAsk('a', 'b', 7);
    assert.deepEqual(E.H.players[0].books, [7]);
    assert.equal(E.H.players[0].hand.length, 0, 'Ann genuinely has nothing left');
    assert.equal(E.H.turnIdx, 1, 'the turn moved on to Bo rather than freezing on an unplayable hand');
});

test('hostAsk (matched fish): completing a book via the drawn card itself also refills instead of softlocking', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        // Ann holds three 7s and asks Bo, who has none — a miss, so she fishes. The stock's
        // top card happens to be the matching 7, completing the book AND emptying her hand
        // in the same beat.
        { id: 'a', name: 'Ann', hand: [c(7, 'S'), c(7, 'C'), c(7, 'D')], books: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(2, 'H')], books: [], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.stock = [c(9, 'D'), c(7, 'H')];   // pop() takes the 7H first — the match — then 9D remains
    E.hostAsk('a', 'b', 7);
    assert.deepEqual(E.H.players[0].books, [7]);
    assert.equal(E.H.turnIdx, 0, 'matched the fish — still her turn');
    assert.equal(E.H.players[0].hand.length, 1, 'auto-refilled rather than left empty');
    assert.equal(E.H.players[0].hand[0].id, '9D');
});

test('refillIfEmpty: draws one card when the stock has one, reports false when it does not', () => {
    const E = makeEngine();
    const p1 = { hand: [], books: [] };
    E.H.stock = [c(3, 'S')];
    assert.equal(E.refillIfEmpty(p1), true);
    assert.equal(p1.hand.length, 1);
    const p2 = { hand: [], books: [] };
    E.H.stock = [];
    assert.equal(E.refillIfEmpty(p2), false);
    assert.equal(p2.hand.length, 0);
    const p3 = { hand: [c(5, 'H')], books: [] };
    E.H.stock = [c(3, 'S')];
    assert.equal(E.refillIfEmpty(p3), true, 'a non-empty hand is left untouched');
    assert.equal(p3.hand.length, 1);
    assert.equal(E.H.stock.length, 1, 'nothing drawn — the hand was never empty');
});
