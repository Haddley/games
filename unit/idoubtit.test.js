// Unit tests for I Doubt It's pure card model and the host play/challenge engine —
// `npm run test:unit`, no browser. `hostStartGame`/`hostPlay`/`hostChallenge`/`resolvePlay`
// reference `capPlayer()` and `broadcast()`, which live in the connection section of the file
// and depend on network globals — those are passed in as stubs here, exactly the pattern
// `unit/gofish.test.js` and `unit/blackjack.test.js` use elsewhere in this repo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'idoubtit.html'), 'utf8');

const SRC = (() => {
    const a = HTML.indexOf("const PFX = 'IDOUBT-';");
    const b = HTML.indexOf('// MESSAGES / DISPLAY', a);
    assert.ok(a >= 0 && b > a, 'could not slice the constants/card/host-logic block out of idoubtit.html');
    return HTML.slice(a, b);
})();

// A fresh engine per test: `capPlayer` always says the first player may act as captain,
// `broadcast` is a no-op (each test reads `H` directly afterward, same as the real host does).
function makeEngine() {
    const capPlayer = () => H.players[0] || null;
    const broadcast = () => {};
    const fn = new Function('capPlayer', 'broadcast',
        SRC + `\nreturn { H, hostAddPlayer, hostStartGame, hostPlayAgain, hostCtl, hostPlay,
            hostChallenge, resolvePlay, advanceTurn, requiredRank, makeCard, makeDeck };`);
    return fn(capPlayer, broadcast);
}

const c = (rank, suit) => ({ rank, suit, id: rank + suit });

test('hostPlay: rejects a card the player does not hold, and mutates nothing', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(3, 'S')], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.hostPlay('a', ['7H'], 7);   // that card is in Bo's hand, not Ann's
    assert.equal(E.H.players[0].hand.length, 1, 'Ann still holds her one card');
    assert.equal(E.H.players[1].hand.length, 1, "Bo's hand is untouched");
    assert.equal(E.H.lastPlay, null, 'no play was recorded');
});

test('hostPlay: rejects duplicate card ids in one play instead of corrupting the hand', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(3, 'S'), c(4, 'H')], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.hostPlay('a', ['3S', '3S'], 3);
    assert.equal(E.H.players[0].hand.length, 2, 'nothing was removed');
    assert.equal(E.H.lastPlay, null);
});

test('hostPlay: a legitimate play moves the real cards into the pile and opens a challenge window', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(3, 'S'), c(4, 'H')], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.hostPlay('a', ['3S', '4H'], 9);   // bluffing — claims 9s, plays a 3 and a 4
    assert.equal(E.H.players[0].hand.length, 0);
    assert.equal(E.H.pile.length, 2, 'both played cards sit in the pile');
    assert.deepEqual(E.H.lastPlay.cards.map(x => x.id).sort(), ['3S', '4H']);
    assert.equal(E.H.lastPlay.claimedRank, 9);
    assert.ok(E.H.challengeDeadline > Date.now());
});

test('hostPlay: in sequence mode, only the currently-required rank may be claimed', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.sequenceMode = true;
    E.H.seqRankIdx = 0;   // Aces required
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(5, 'S')], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.hostPlay('a', ['5S'], 5);   // wrong claim for this turn — must be Aces (1)
    assert.equal(E.H.lastPlay, null, 'the host refuses the mismatched claim regardless of what the client sent');
    E.hostPlay('a', ['5S'], 1);   // claims Aces, honestly or not — that's what sequence mode requires
    assert.ok(E.H.lastPlay, 'the correctly-claimed rank is accepted');
    assert.equal(E.H.lastPlay.claimedRank, 1);
});

test('resolvePlay: unchallenged — the pile stays put and the turn advances', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        // Ann still holds a card after this play, so this isolates the "unchallenged, not a
        // win" path from the separate "unchallenged AND hand now empty" win case below.
        { id: 'a', name: 'Ann', hand: [c(6, 'C')], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(7, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.pile = [c(3, 'S')];
    E.H.lastPlay = { playerId: 'a', claimedRank: 3, cards: [c(3, 'S')] };
    E.resolvePlay(null);
    assert.equal(E.H.lastPlay, null);
    assert.equal(E.H.pile.length, 1, 'unchallenged cards are never returned to anyone');
    assert.equal(E.H.phase, 'playing', 'not a win — Ann still has a card left');
    assert.equal(E.H.turnIdx, 1, 'turn moved on to Bo');
});

test('resolvePlay: a challenge that catches a bluff sends the WHOLE pile to the bluffer', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(9, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    // An older unchallenged card is already sitting in the pile — a real challenge picks up
    // EVERYTHING accumulated, not just the most recent play.
    E.H.pile = [c(5, 'D'), c(3, 'S')];
    E.H.lastPlay = { playerId: 'a', claimedRank: 9, cards: [c(3, 'S')] };   // claimed 9s, played a 3 — a lie
    E.resolvePlay('b');
    assert.equal(E.H.pile.length, 0, 'the pile is now empty — it all moved');
    assert.equal(E.H.players[0].hand.length, 2, 'Ann (the bluffer) picks up both pile cards');
    assert.equal(E.H.players[1].hand.length, 1, "Bo (correct challenger) keeps only what he already had");
});

test('resolvePlay: a challenge against an honest play backfires onto the challenger', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(9, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.pile = [c(3, 'S')];
    E.H.lastPlay = { playerId: 'a', claimedRank: 3, cards: [c(3, 'S')] };   // genuinely a 3
    E.resolvePlay('b');
    assert.equal(E.H.players[1].hand.length, 2, 'Bo (the wrong challenger) picks up the pile');
    assert.equal(E.H.players[0].hand.length, 0, 'Ann (told the truth) keeps her empty hand');
});

test('resolvePlay: going out and surviving (unchallenged) ends the match immediately', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(9, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.pile = [c(3, 'S')];
    E.H.lastPlay = { playerId: 'a', claimedRank: 3, cards: [c(3, 'S')] };
    E.resolvePlay(null);
    assert.equal(E.H.phase, 'match_over');
    assert.equal(E.H.winnerId, 'a');
});

test('resolvePlay: going out but getting CAUGHT bluffing un-wins the hand — the game continues', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(9, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.pile = [c(5, 'D')];   // Ann's "final" card was actually a 5, not the claimed rank
    E.H.lastPlay = { playerId: 'a', claimedRank: 9, cards: [c(5, 'D')] };
    E.resolvePlay('b');
    assert.equal(E.H.phase, 'playing', 'the match is NOT over — Ann was caught');
    assert.equal(E.H.players[0].hand.length, 1, 'the pile lands back in the bluffer\'s hand');
    assert.equal(E.H.turnIdx, 1, 'and play continues to the next player');
});

test('resolvePlay: a stale/duplicate resolution after the play already cleared is a no-op', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(2, 'S')], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(9, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.lastPlay = null;   // already resolved by whichever of (timer, challenge) ran first
    E.H.pile = [];
    E.resolvePlay('b');    // a second, late trigger
    assert.equal(E.H.turnIdx, 0, 'nothing happened — no phantom turn advance');
    assert.equal(E.H.players[0].hand.length, 1);
    assert.equal(E.H.players[1].hand.length, 1);
});

test('hostChallenge: a player cannot challenge their own pending play', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(9, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    E.H.pile = [c(3, 'S')];
    E.H.lastPlay = { playerId: 'a', claimedRank: 9, cards: [c(3, 'S')] };   // a lie
    E.hostChallenge('a');   // Ann tries to challenge herself
    assert.ok(E.H.lastPlay, 'the play is still pending — self-challenge was refused');
});

test('advanceTurn: sequence mode cycles Aces through Kings and wraps back to Aces', () => {
    const E = makeEngine();
    E.H.phase = 'playing';
    E.H.sequenceMode = true;
    E.H.seqRankIdx = 12;   // Kings
    E.H.players = [
        { id: 'a', name: 'Ann', hand: [c(2, 'S')], spectating: false },
        { id: 'b', name: 'Bo', hand: [c(9, 'H')], spectating: false },
    ];
    E.H.turnIdx = 0;
    assert.equal(E.requiredRank(), 13, 'Kings, before the wrap');
    E.advanceTurn();
    assert.equal(E.requiredRank(), 1, 'wraps back to Aces');
});

test('requiredRank: null outside sequence mode — any rank may be claimed', () => {
    const E = makeEngine();
    E.H.sequenceMode = false;
    assert.equal(E.requiredRank(), null);
});
