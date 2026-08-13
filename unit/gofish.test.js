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
        SRC + '\nreturn { H, hostAddPlayer, hostStartGame, hostPlayAgain, hostCtl, advanceTurn, hostAsk, layBooks, makeCard, checkMatchOver };');
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
