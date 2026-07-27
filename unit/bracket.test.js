// The shared knockout draw (bracket.js).
//
// It is pure logic with no DOM, which is the whole reason it can be tested this thoroughly —
// and it needs to be, because the awkward case (byes, when the player count is not a power of
// two) is the one nobody plays often enough to notice being wrong.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const api = new Function(fs.readFileSync(path.join(__dirname, '..', 'bracket.js'), 'utf8') +
    '\nreturn { bracketShape, makeBracket, nextMatch, reportWinner, roundName, stillIn, knockedOut };')();
const { bracketShape, makeBracket, nextMatch, reportWinner, roundName, stillIn, knockedOut } = api;

// play a whole tournament, always letting the FIRST-named player win
function runAll(seats, pick) {
    const b = makeBracket(seats);
    let champ = null, guard = 0;
    while (!champ && guard++ < 100) {
        const m = nextMatch(b);
        if (!m) break;
        champ = reportWinner(b, pick ? pick(m) : m.a);
    }
    return { b, champ };
}

test('a power-of-two field has no byes and halves each round', () => {
    const b = makeBracket(['a', 'b', 'c', 'd']);
    assert.deepStrictEqual(bracketShape(4), { matches: 2, byes: 0, size: 4 });
    assert.strictEqual(b.rounds.length, 1);
    assert.strictEqual(b.rounds[0].length, 2, 'four players, two first-round matches');
    assert.deepStrictEqual(b.rounds[0].map(m => [m.a, m.b]), [['a', 'b'], ['c', 'd']]);
});

test('byes go to the top seeds, and only in the first round', () => {
    // 5 players → next power of two is 8 → 3 byes, 1 match. The three earliest entrants sit
    // round one out, which is the convention every real tournament uses.
    assert.deepStrictEqual(bracketShape(5), { matches: 1, byes: 3, size: 8 });
    const b = makeBracket(['a', 'b', 'c', 'd', 'e']);
    assert.deepStrictEqual(b.byes, ['a', 'b', 'c']);
    assert.deepStrictEqual(b.rounds[0].map(m => [m.a, m.b]), [['d', 'e']]);

    reportWinner(b, 'd');
    assert.strictEqual(b.rounds.length, 2, 'round one is done, so round two exists');
    assert.deepStrictEqual(b.rounds[1].map(m => [m.a, m.b]), [['a', 'b'], ['c', 'd']],
        'the byes join the winner, and nobody gets a second bye');
});

test('every field from 2 to 12 produces exactly one champion and no lost players', () => {
    for (let n = 2; n <= 12; n++) {
        const seats = Array.from({ length: n }, (_, i) => 'p' + i);
        const { b, champ } = runAll(seats);
        assert.ok(champ != null, `${n} players: no champion`);
        assert.ok(seats.includes(champ), `${n} players: champion is not one of them`);
        const out = knockedOut(b);
        assert.strictEqual(out.length, n - 1, `${n} players: ${out.length} knocked out, expected ${n - 1}`);
        assert.strictEqual(new Set(out).size, out.length, `${n} players: somebody was knocked out twice`);
        assert.ok(!out.includes(champ), `${n} players: the champion is in the knocked-out list`);
        // …and everyone is accounted for exactly once
        assert.deepStrictEqual([champ].concat(out).sort(), seats.slice().sort());
    }
});

test('nobody plays twice in a round, and nobody plays themselves', () => {
    for (let n = 2; n <= 12; n++) {
        const seats = Array.from({ length: n }, (_, i) => 'p' + i);
        const { b } = runAll(seats);
        b.rounds.forEach((round, r) => {
            const seen = [];
            round.forEach(m => {
                assert.notStrictEqual(m.a, m.b, `${n} players, round ${r}: somebody played themselves`);
                [m.a, m.b].forEach(x => {
                    if (x == null) return;
                    assert.ok(seen.indexOf(x) < 0, `${n} players, round ${r}: ${x} appears twice`);
                    seen.push(x);
                });
            });
        });
    }
});

test('rounds are named from the final backwards, which is what people recognise', () => {
    const { b } = runAll(Array.from({ length: 8 }, (_, i) => 'p' + i));
    assert.deepStrictEqual(b.rounds.map((_, r) => roundName(b, r)),
        ['Quarter-final', 'Semi-final', 'Final']);
    const two = makeBracket(['a', 'b']);
    assert.strictEqual(roundName(two, 0), 'Final', 'two players play the final, not "round 1"');
    const big = runAll(Array.from({ length: 16 }, (_, i) => 'p' + i)).b;
    assert.strictEqual(roundName(big, 0), 'Round of 16');
});

test('stillIn shrinks to the champion; knockedOut is earliest-out first', () => {
    const b = makeBracket(['a', 'b', 'c', 'd']);
    assert.deepStrictEqual(stillIn(b).sort(), ['a', 'b', 'c', 'd']);
    reportWinner(b, 'a');                       // b out first
    reportWinner(b, 'c');                       // d out second
    assert.deepStrictEqual(stillIn(b).sort(), ['a', 'c']);
    const champ = reportWinner(b, 'a');         // c out last
    assert.strictEqual(champ, 'a');
    assert.deepStrictEqual(stillIn(b), ['a']);
    assert.deepStrictEqual(knockedOut(b), ['b', 'd', 'c'],
        'earliest out first — which is exactly the order rankByElimination wants');
});

test('a result for somebody who is not in the current match is ignored', () => {
    // A late or duplicated message must never corrupt the draw.
    const b = makeBracket(['a', 'b', 'c', 'd']);
    assert.strictEqual(reportWinner(b, 'd'), null, 'd is not in the first match');
    assert.strictEqual(b.rounds[0][0].w, null, 'and the match is still unplayed');
    reportWinner(b, 'a');
    assert.strictEqual(b.rounds[0][0].w, 'a');
    reportWinner(b, 'b');                        // a stale second result for a finished match
    assert.strictEqual(b.rounds[0][0].w, 'a', 'the first result stands');
});

test('degenerate fields do not crash', () => {
    assert.deepStrictEqual(makeBracket([]).rounds, []);
    assert.strictEqual(makeBracket([]).champion, null);
    const solo = makeBracket(['a']);
    assert.strictEqual(solo.champion, 'a', 'one player has already won');
    assert.strictEqual(nextMatch(solo), null);
    assert.strictEqual(nextMatch(null), null);
    assert.strictEqual(reportWinner(null, 'a'), null);
    assert.strictEqual(roundName(null, 0), '');
    assert.deepStrictEqual(knockedOut(null), []);
});
