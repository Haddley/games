// Unit tests for Last Card's pure card model and the host play/challenge engine —
// `npm run test:unit`, no browser. Unlike the other four card games, this one keeps its own
// inline card model and its own inline capPlayer/capSync/addMilestone (see lastcardplan.md's
// Context section — cards.js is scoped to the standard 52-card deck, and Uno's deck is a
// different shape entirely), so this harness stubs those plus broadcast/broadcastLobby/shuffle,
// exactly the pattern idoubtit.test.js/gofish.test.js/blackjack.test.js use elsewhere in this repo.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'lastcard.html'), 'utf8');

const SRC = (() => {
    const a = HTML.indexOf("const PFX = 'LASTCARD-';");
    const b = HTML.indexOf('// MESSAGES / DISPLAY', a);
    assert.ok(a >= 0 && b > a, 'could not slice the constants/card/host-logic block out of lastcard.html');
    return HTML.slice(a, b);
})();

function makeEngine() {
    const capPlayer = () => H.players[0] || null;
    const broadcast = () => {};
    const broadcastLobby = () => {};
    const addMilestone = () => {};
    const shuffle = a => a;   // identity — tests control deck order directly, no need for real randomness
    const fn = new Function('capPlayer', 'broadcast', 'broadcastLobby', 'addMilestone', 'shuffle',
        SRC + `\nreturn { H, hostAddPlayer, hostStartGame, hostPlayAgain, hostCtl, hostPlay, hostDraw,
            hostPass, hostChallengeWild4, hostCallout, hostCatch, resolveWild4, applyCardEffect,
            stepTurn, nextIdx, activePlayerCount, checkCalloutPenalty, updateCallout, drawCards,
            checkWin, ensureStock, isLegal, canPlayWild4, makeCard, makeDeck, cardLabel, colorClass,
            cardGlyph, COLORS };`);
    return fn(capPlayer, broadcast, broadcastLobby, addMilestone, shuffle);
}

const num = (color, value) => ({ color, kind: 'number', value, id: color + value + Math.random() });
const act = (color, kind) => ({ color, kind, value: null, id: color + kind + Math.random() });
const wild = () => ({ color: null, kind: 'wild', value: null, id: 'w' + Math.random() });
const wild4 = () => ({ color: null, kind: 'wild4', value: null, id: 'w4' + Math.random() });

// ── card model ──────────────────────────────────────────────────────────────
test('makeDeck: exactly 108 cards, with the correct composition', () => {
    const E = makeEngine();
    const deck = E.makeDeck();
    assert.equal(deck.length, 108);
    const numbers = deck.filter(c => c.kind === 'number');
    const actions = deck.filter(c => ['skip', 'reverse', 'drawTwo'].includes(c.kind));
    const wilds = deck.filter(c => c.kind === 'wild');
    const wild4s = deck.filter(c => c.kind === 'wild4');
    assert.equal(numbers.length, 4 * 19, 'one 0 + two each of 1-9, per colour, times 4 colours');
    assert.equal(actions.length, 4 * 6, 'two each of skip/reverse/drawTwo, per colour, times 4');
    assert.equal(wilds.length, 4);
    assert.equal(wild4s.length, 4);
    E.COLORS.forEach(color => {
        assert.equal(numbers.filter(c => c.color === color && c.value === 0).length, 1, `${color} has exactly one 0`);
        for (let v = 1; v <= 9; v++) assert.equal(numbers.filter(c => c.color === color && c.value === v).length, 2, `${color} has two ${v}s`);
    });
});

test('isLegal: matches by colour, matches by number, matches by action-card kind across colours', () => {
    const E = makeEngine();
    const top = num('red', 5);
    assert.equal(E.isLegal(num('red', 2), top, 'red'), true, 'same colour');
    assert.equal(E.isLegal(num('blue', 5), top, 'red'), true, 'same number, different colour');
    assert.equal(E.isLegal(num('blue', 3), top, 'red'), false, 'different colour and number');
    const topSkip = act('green', 'skip');
    assert.equal(E.isLegal(act('yellow', 'skip'), topSkip, 'green'), true, 'same symbol (Skip), different colour');
    assert.equal(E.isLegal(act('yellow', 'reverse'), topSkip, 'green'), false, 'different symbol, different colour');
});
test('isLegal: Wild and Wild Draw Four are always legal to play, regardless of the top card', () => {
    const E = makeEngine();
    const top = num('red', 5);
    assert.equal(E.isLegal(wild(), top, 'red'), true);
    assert.equal(E.isLegal(wild4(), top, 'blue'), true);
});
test('canPlayWild4: only legal when the hand holds no card of the active colour', () => {
    const E = makeEngine();
    assert.equal(E.canPlayWild4([num('blue', 3), num('green', 7)], 'red'), true, 'no red card in hand');
    assert.equal(E.canPlayWild4([num('blue', 3), num('red', 7)], 'red'), false, 'a red card is held');
    assert.equal(E.canPlayWild4([wild(), wild4()], 'red'), true, 'wilds themselves never count as "holding" a colour');
});

// ── turn direction / action-card effects ─────────────────────────────────────
function setupPlayers(E, n) {
    E.H.players = Array.from({ length: n }, (_, i) => ({ id: 'p' + i, name: 'P' + i, hand: [num('red', 1)], spectating: false }));
    E.H.turnIdx = 0; E.H.direction = 1;
}
test('applyCardEffect: a number card advances the turn by exactly one player', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.applyCardEffect(num('red', 4));
    assert.equal(E.H.turnIdx, 1);
});
test('applyCardEffect: Skip advances two players (the immediate next player misses their turn)', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.applyCardEffect(act('red', 'skip'));
    assert.equal(E.H.turnIdx, 2);
});
test('applyCardEffect: Draw Two gives the next player two cards and skips them', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.stock = [num('blue', 1), num('blue', 2)];
    const before = E.H.players[1].hand.length;
    E.applyCardEffect(act('red', 'drawTwo'));
    assert.equal(E.H.players[1].hand.length, before + 2, 'the skipped player actually received 2 cards');
    assert.equal(E.H.turnIdx, 2, 'and their turn was skipped');
});
test('applyCardEffect: Reverse flips direction and advances one player, with 3+ players', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.applyCardEffect(act('red', 'reverse'));
    assert.equal(E.H.direction, -1);
    assert.equal(E.H.turnIdx, 2, 'moving backward from 0 with 3 players lands on 2');
});
test('applyCardEffect: Reverse acts as Skip in a 2-player game — no direction flip, current player effectively gets another go', () => {
    const E = makeEngine(); setupPlayers(E, 2);
    E.applyCardEffect(act('red', 'reverse'));
    assert.equal(E.H.direction, 1, 'direction is NOT flipped — flipping is meaningless with only 2 players');
    assert.equal(E.H.turnIdx, 0, 'the opponent (index 1) was skipped, so it comes back to player 0');
});
test('nextIdx / stepTurn: skips spectating players in either direction', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.players[1].spectating = true;
    E.stepTurn(1);
    assert.equal(E.H.turnIdx, 2, 'player 1 is spectating, so play jumps straight to player 2');
});

// ── Wild Draw Four challenge ──────────────────────────────────────────────────
test('hostPlay: playing a Wild Draw Four opens a pending challenge instead of advancing the turn immediately', () => {
    const E = makeEngine();
    setupPlayers(E, 3);
    E.H.phase = 'playing';
    const w4 = wild4();
    E.H.players[0].hand = [w4];
    E.H.discard = [num('red', 5)]; E.H.activeColor = 'red';
    E.hostPlay('p0', w4.id, 'blue');
    assert.equal(E.H.turnIdx, 0, 'turn has not advanced yet — waiting on the challenge window');
    assert.ok(E.H.pendingWild4, 'a pending challenge was opened');
    assert.equal(E.H.pendingWild4.nextPlayerId, 'p1');
    assert.equal(E.H.activeColor, 'blue', 'the declared colour took effect immediately');
});
test('resolveWild4: challenge SUCCEEDS when the player really did have a legal alternative — they draw 4, challenger\'s turn proceeds normally', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.pendingWild4 = { playerId: 'p0', nextPlayerId: 'p1', hadColorBefore: true, deadline: Date.now() + 1000 };
    E.H.turnIdx = 0;
    E.H.stock = [num('blue', 1), num('blue', 2), num('blue', 3), num('blue', 4)];
    const before = E.H.players[0].hand.length;
    E.resolveWild4(true);
    assert.equal(E.H.players[0].hand.length, before + 4, 'the player who bluffed the Wild Draw Four draws 4');
    assert.equal(E.H.turnIdx, 1, "the challenger's turn proceeds normally — they are not skipped");
    assert.equal(E.H.pendingWild4, null);
});
test('resolveWild4: challenge FAILS when the player genuinely had no legal alternative — challenger draws 6 total and is skipped', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.pendingWild4 = { playerId: 'p0', nextPlayerId: 'p1', hadColorBefore: false, deadline: Date.now() + 1000 };
    E.H.turnIdx = 0;
    E.H.stock = Array.from({ length: 6 }, () => num('blue', 1));
    const before = E.H.players[1].hand.length;
    E.resolveWild4(true);
    assert.equal(E.H.players[1].hand.length, before + 6, 'the challenger draws 4 + 2 penalty = 6');
    assert.equal(E.H.turnIdx, 2, 'and their own turn is skipped entirely');
});
test('resolveWild4: unchallenged — next player draws 4 and is skipped, same shape as a failed challenge', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.pendingWild4 = { playerId: 'p0', nextPlayerId: 'p1', hadColorBefore: false, deadline: Date.now() + 1000 };
    E.H.turnIdx = 0;
    E.H.stock = Array.from({ length: 4 }, () => num('blue', 1));
    const before = E.H.players[1].hand.length;
    E.resolveWild4(false);
    assert.equal(E.H.players[1].hand.length, before + 4);
    assert.equal(E.H.turnIdx, 2);
});
test('hostChallengeWild4: only the designated next player may challenge', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.pendingWild4 = { playerId: 'p0', nextPlayerId: 'p1', hadColorBefore: true, deadline: Date.now() + 1000 };
    E.hostChallengeWild4('p2');   // not the eligible player
    assert.ok(E.H.pendingWild4, 'a wrong-player challenge is a no-op');
    E.hostChallengeWild4('p1');
    assert.equal(E.H.pendingWild4, null, 'the eligible player really can resolve it');
});

// ── win check only after any pending consequence resolves ────────────────────
test('checkWin: an empty hand from a normal card wins immediately', () => {
    const E = makeEngine(); setupPlayers(E, 2);
    E.H.players[0].hand = [];
    E.checkWin(E.H.players[0]);
    assert.equal(E.H.phase, 'match_over');
    assert.equal(E.H.winnerId, 'p0');
});
test('going out on a Wild Draw Four that is unchallenged genuinely wins', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.players[0].hand = [];   // they already played their last card (the wild4) before this resolves
    E.H.pendingWild4 = { playerId: 'p0', nextPlayerId: 'p1', hadColorBefore: false, deadline: Date.now() + 1000 };
    E.H.turnIdx = 0;
    E.H.stock = Array.from({ length: 4 }, () => num('blue', 1));
    E.resolveWild4(false);
    assert.equal(E.H.phase, 'match_over');
    assert.equal(E.H.winnerId, 'p0');
});
test('going out on a Wild Draw Four that is challenged and SUCCEEDS un-wins the hand — they draw 4 back', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.players[0].hand = [];
    E.H.pendingWild4 = { playerId: 'p0', nextPlayerId: 'p1', hadColorBefore: true, deadline: Date.now() + 1000 };
    E.H.turnIdx = 0;
    E.H.stock = Array.from({ length: 4 }, () => num('blue', 1));
    E.resolveWild4(true);
    assert.notEqual(E.H.phase, 'match_over', 'the win is reversed — they now hold 4 cards again');
    assert.equal(E.H.players[0].hand.length, 4);
});
test('going out on a Wild Draw Four that is challenged and FAILS still wins — the challenge backfired on the challenger', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.players[0].hand = [];
    E.H.pendingWild4 = { playerId: 'p0', nextPlayerId: 'p1', hadColorBefore: false, deadline: Date.now() + 1000 };
    E.H.turnIdx = 0;
    E.H.stock = Array.from({ length: 6 }, () => num('blue', 1));
    E.resolveWild4(true);
    assert.equal(E.H.phase, 'match_over');
    assert.equal(E.H.winnerId, 'p0');
});

// ── "Last Card" callout ────────────────────────────────────────────────────────
test('updateCallout: reaching exactly one card opens a pending callout; drawing back above one closes it', () => {
    const E = makeEngine(); setupPlayers(E, 2);
    E.H.players[0].hand = [num('red', 1)];
    E.updateCallout(E.H.players[0]);
    assert.deepStrictEqual(E.H.pendingCallout, { playerId: 'p0', called: false });
    E.H.players[0].hand.push(num('blue', 2), num('blue', 3));
    E.updateCallout(E.H.players[0]);
    assert.equal(E.H.pendingCallout, null, 'no longer at exactly one card');
});
test('checkCalloutPenalty: fires automatically the instant the uncaught player\'s own next turn begins, not before', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.pendingCallout = { playerId: 'p0', called: false };
    E.H.stock = [num('blue', 9), num('blue', 8)];
    E.H.turnIdx = 1;
    E.checkCalloutPenalty();   // it's player 1's turn right now — not p0's — must NOT fire
    assert.ok(E.H.pendingCallout, 'still pending — this is not p0\'s turn yet');
    E.H.turnIdx = 0;
    const before = E.H.players[0].hand.length;
    E.checkCalloutPenalty();
    assert.equal(E.H.pendingCallout, null, 'the callout window has closed');
    assert.equal(E.H.players[0].hand.length, before + 2, 'the automatic 2-card penalty was applied');
});
test('hostCallout: a player who calls it in time avoids the penalty entirely', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.pendingCallout = { playerId: 'p0', called: false };
    E.hostCallout('p0');
    assert.equal(E.H.pendingCallout.called, true);
    E.H.turnIdx = 1;
    E.stepTurn(2);   // cycles turnIdx back onto p0
    assert.equal(E.H.turnIdx, 0);
    assert.equal(E.H.players[0].hand.length, 1, 'no penalty — they called it before their turn came back around');
});
test('hostCatch: another player can catch the callout early, before the automatic check would have fired', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.pendingCallout = { playerId: 'p0', called: false };
    E.H.stock = [num('blue', 1), num('blue', 2)];
    E.hostCatch('p1');
    assert.equal(E.H.pendingCallout, null);
    assert.equal(E.H.players[0].hand.length, 3, 'the 2-card penalty landed immediately, not just at their next turn');
});
test('hostCatch: cannot catch yourself, and cannot catch after it has already been called', () => {
    const E = makeEngine(); setupPlayers(E, 3);
    E.H.pendingCallout = { playerId: 'p0', called: false };
    const startHand = E.H.players[0].hand.length;
    E.hostCatch('p0');
    assert.ok(E.H.pendingCallout, 'catching yourself is a no-op');
    assert.equal(E.H.players[0].hand.length, startHand, 'no penalty applied');
    E.H.pendingCallout.called = true;
    E.hostCatch('p1');
    assert.ok(E.H.pendingCallout, 'already-called callouts stay put, not cleared');
    assert.equal(E.H.players[0].hand.length, startHand, 'still no penalty — the callout was legitimate');
});
