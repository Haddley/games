// Unit tests for Blackjack's pure hand-value/bust/blackjack/dealer-rule/payout logic —
// `npm run test:unit`, no browser. These are the functions every hand actually resolves
// through, so a bug here is a bug at the table, not just on screen.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'blackjack.html'), 'utf8');

// Pull the pure logic block out of the page — matches the pattern used for goinggone's ask
// ladder and kingscorner's legal-move functions: slice by a distinctive start/end string so
// the game itself stays the single source of truth.
const SRC = (() => {
    const a = HTML.indexOf('function handValue(');
    const b = HTML.indexOf('// ═══════════════════════════════════════════\n// HOST STATE', a);
    assert.ok(a >= 0 && b > a, 'could not slice the hand-value/payout block out of blackjack.html');
    return HTML.slice(a, b);
})();
const BJ = new Function(SRC + '\nreturn { handValue, isBlackjack, dealerShouldHit, resolveHand, suggestAction };')();

const c = (rank, suit) => ({ rank, suit, id: rank + suit });
const A = s => c(1, s || 'S');
const K = s => c(13, s || 'H');
const Q = s => c(12, s || 'D');
const N = (n, s) => c(n, s || 'C');

test('handValue: a plain hard total', () => {
    const v = BJ.handValue([N(9), N(7)]);
    assert.equal(v.total, 16);
    assert.equal(v.soft, false);
    assert.equal(v.isBust, false);
});

test('handValue: an ace counts 11 while it can', () => {
    const v = BJ.handValue([A(), N(9)]);
    assert.equal(v.total, 20);
    assert.equal(v.soft, true, 'still a soft 20 — the ace is counted as 11');
});

test('handValue: an ace drops to 1 the moment 11 would bust it', () => {
    const v = BJ.handValue([A(), N(9), N(5)]);
    assert.equal(v.total, 15, 'A+9+5 = 11+9+5=25 busts, so the ace drops to 1: 1+9+5=15');
    assert.equal(v.soft, false);
    assert.equal(v.isBust, false);
});

test('handValue: two aces — one stays 11, one drops to 1', () => {
    const v = BJ.handValue([A(), A(), N(9)]);
    assert.equal(v.total, 21, 'A+A+9: 11+1+9=21');
    assert.equal(v.soft, true, 'one ace is still counted as 11');
});

test('handValue: three aces', () => {
    const v = BJ.handValue([A(), A(), A()]);
    assert.equal(v.total, 13, 'A+A+A: 11+1+1=13');
    assert.equal(v.soft, true);
});

test('handValue: face cards are all worth ten', () => {
    const v = BJ.handValue([K(), Q()]);
    assert.equal(v.total, 20);
});

test('handValue: a real bust', () => {
    const v = BJ.handValue([N(10), N(9), N(5)]);
    assert.equal(v.total, 24);
    assert.equal(v.isBust, true);
});

test('isBlackjack: a natural is exactly two cards totalling 21', () => {
    assert.equal(BJ.isBlackjack([A(), K()]), true);
    assert.equal(BJ.isBlackjack([A(), Q()]), true);
    assert.equal(BJ.isBlackjack([N(7), N(7), N(7)]), false, 'three cards making 21 is not a natural');
    assert.equal(BJ.isBlackjack([N(10), N(9)]), false);
});

test('dealerShouldHit: stands on 17 or more, hard or soft', () => {
    assert.equal(BJ.dealerShouldHit([N(10), N(6)]), true, 'hard 16 hits');
    assert.equal(BJ.dealerShouldHit([N(10), N(7)]), false, 'hard 17 stands');
    assert.equal(BJ.dealerShouldHit([A(), N(6)]), false, 'soft 17 (A+6=17) stands too — S17');
    assert.equal(BJ.dealerShouldHit([N(10), N(10)]), false, '20 stands');
});

test('resolveHand: a player bust loses regardless of the dealer', () => {
    const r = BJ.resolveHand([N(10), N(9), N(5)], [N(10), N(2)], 50);
    assert.equal(r.outcome, 'lose');
    assert.equal(r.payout, 0);
});

test('resolveHand: dealer bust pays the player even', () => {
    const r = BJ.resolveHand([N(10), N(8)], [N(10), N(6), N(9)], 50);
    assert.equal(r.outcome, 'win');
    assert.equal(r.payout, 100, 'stake plus stake — the original 50 comes back too');
});

test('resolveHand: a natural blackjack pays 3:2 over a non-blackjack dealer', () => {
    const r = BJ.resolveHand([A(), K()], [N(10), N(9)], 20);
    assert.equal(r.outcome, 'blackjack');
    assert.equal(r.payout, 50, '20 stake + 30 winnings (1.5x)');
});

test('resolveHand: two blackjacks push, not a 3:2 win', () => {
    const r = BJ.resolveHand([A(), K()], [A(), Q()], 20);
    assert.equal(r.outcome, 'push');
    assert.equal(r.payout, 20, 'stake returned, nothing more');
});

test('resolveHand: a dealer blackjack beats a non-blackjack 21', () => {
    const r = BJ.resolveHand([N(7), N(7), N(7)], [A(), K()], 20);
    assert.equal(r.outcome, 'lose');
    assert.equal(r.payout, 0);
});

test('resolveHand: higher total wins, lower total loses, equal totals push', () => {
    assert.equal(BJ.resolveHand([N(10), N(9)], [N(10), N(7)], 10).outcome, 'win');
    assert.equal(BJ.resolveHand([N(10), N(7)], [N(10), N(9)], 10).outcome, 'lose');
    assert.equal(BJ.resolveHand([N(10), N(8)], [N(9), N(9)], 10).outcome, 'push');
});

test('resolveHand: a double-down bet pays out on the doubled amount', () => {
    // Doubling multiplies the STORED bet before resolve ever runs (see hostDouble) — resolveHand
    // itself just needs to treat whatever `bet` it's handed correctly, which this checks in
    // isolation so a future change to the double-down bookkeeping can't silently halve payouts.
    const r = BJ.resolveHand([N(10), N(9)], [N(10), N(6)], 100);   // 100 = an original 50 doubled
    assert.equal(r.outcome, 'win');
    assert.equal(r.payout, 200);
});

// ── suggestAction: the 🎓 Coach hint. A simplified teaching chart (not tournament-precision
// strategy) — these assertions check it against well-known, unambiguous basic-strategy
// textbook calls, not every edge case.
test('suggestAction: always stands on a hard 17 or more', () => {
    assert.equal(BJ.suggestAction(17, false, 10, false).action, 'stand');
    assert.equal(BJ.suggestAction(20, false, 6, false).action, 'stand');
});
test('suggestAction: always hits a hard total of 8 or less', () => {
    assert.equal(BJ.suggestAction(8, false, 6, false).action, 'hit');
    assert.equal(BJ.suggestAction(5, false, 10, false).action, 'hit');
});
test('suggestAction: stands on hard 13-16 against a weak dealer card, hits against a strong one', () => {
    assert.equal(BJ.suggestAction(14, false, 5, false).action, 'stand', 'dealer 5 is weak — let them bust');
    assert.equal(BJ.suggestAction(14, false, 10, false).action, 'hit', "dealer 10 is strong — 14 won't survive standing");
    assert.equal(BJ.suggestAction(16, false, 1, false).action, 'hit', 'dealer Ace is strong too');
});
test('suggestAction: 11 is the textbook double, hits if doubling is unavailable', () => {
    assert.equal(BJ.suggestAction(11, false, 6, true).action, 'double');
    assert.equal(BJ.suggestAction(11, false, 6, false).action, 'hit', 'same hand, but can no longer double');
});
test('suggestAction: soft totals never bust on a hit, so low soft totals just hit', () => {
    assert.equal(BJ.suggestAction(15, true, 10, false).action, 'hit');
});
test('suggestAction: soft 19 and up always stands', () => {
    assert.equal(BJ.suggestAction(19, true, 6, false).action, 'stand');
    assert.equal(BJ.suggestAction(21, true, 6, false).action, 'stand');
});
test('suggestAction: soft 18 stands against a weak dealer card, hits against a strong one', () => {
    assert.equal(BJ.suggestAction(18, true, 6, false).action, 'stand');
    assert.equal(BJ.suggestAction(18, true, 10, false).action, 'hit');
    assert.equal(BJ.suggestAction(18, true, 1, false).action, 'hit', "dealer's Ace is the strongest up-card");
});
test('suggestAction: every suggestion carries a plain-English reason', () => {
    for (const a of [BJ.suggestAction(12, false, 5, false), BJ.suggestAction(18, true, 9, false), BJ.suggestAction(9, false, 4, true)]) {
        assert.ok(a.why && a.why.length > 0, 'no suggestion is left unexplained');
    }
});
