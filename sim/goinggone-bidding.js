#!/usr/bin/env node
// Going, Going, GONE! — a simulator for the BIDDING ITSELF.
//
// sim/goinggone.js asks whether the money is balanced. This one asks a different question, the
// one Neil raised: how should the auctioneer's ASK behave once bidding is running?
//
// The shipped rule resets his ask to a full jump after every single bid, so on a keen lot he
// offers a big increase and ladders all the way back down, over and over, and the room hears
// "going…" three times before he has finished coming down. The obvious alternatives are to leave
// the ask where the room last took it (sticky), or to take a bid as encouragement and step back
// up one rung. Which of those is right is an arithmetic question — how many taps a lot costs, how
// long it sits on screen, and whether the price can still climb to what the thing is worth.
//
//   node sim/goinggone-bidding.js               # the four candidate rules, side by side
//   node sim/goinggone-bidding.js --lots 4000
//   node sim/goinggone-bidding.js --players 5
//   node sim/goinggone-bidding.js --trace       # one lot, beat by beat, under each rule
//
// It reads the REAL raise ladder and the REAL clock out of goinggone.html, so it cannot drift
// from the shipped game. What it models is only the bidders: each has a private idea of what the
// lot is worth and a nerve, and takes the auctioneer's ask when it is still under their number.

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const ROOT = path.join(__dirname, '..');
const HTML = fs.readFileSync(path.join(ROOT, 'goinggone.html'), 'utf8');

const arg = (k, d) => {
    const i = process.argv.indexOf('--' + k);
    if (i < 0) return d;
    const v = process.argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : (isNaN(+v) ? v : +v);
};

// ── the real ladder and the real clock, sliced out of the game ──────────────
const slice = (from, to) => {
    const a = HTML.indexOf(from), b = HTML.indexOf(to, a);
    assert.ok(a >= 0 && b > a, `could not slice ${from} out of goinggone.html`);
    return HTML.slice(a, b);
};
const RAISE = new Function(slice('const RAISE_LADDER = [', 'const PLAYER_COLORS') +
    '\nreturn { raisesFor, askLadderFor, softMinRaise };')();
const CLOCK = new Function(slice('const MIN_DECIDE_MS =', 'const PLAYER_COLORS') +
    '\nreturn { ASK_WINDOWS, GAVEL_MS, SOFT_WINDOWS, CLOSE_BEAT_MS, CLOSE_BEATS, INTRO_MS, SOLD_MS };')();
const LOTS = new Function(HTML.match(/const LOTS = \[[\s\S]*?\n\];/)[0] + '\nreturn LOTS;')();

// ── the candidate rules ─────────────────────────────────────────────────────
// What happens to his ask when a bid actually lands.
const RULES = {
    // What ships today. Every bid puts him back at the top of the ladder, so the descent is
    // re-run in full after each one — which is the thing that reads as pointless from a sofa.
    reset: () => 0,
    // He never asks for more than the room has just shown it will pay.
    sticky: soft => soft,
    // A bid is encouragement: he tries one rung bigger next time, but never starts again at the
    // top. This is what a working auctioneer does — he reads the room and adjusts.
    step: soft => Math.max(0, soft - 1),
    // Sticky, and he REMEMBERS THE ROOM: a new lot opens its bidding at roughly the rung the last
    // few lots actually went at, rather than making the same discovery from the top every time.
    seed: soft => soft,
};

// ── one lot, beat by beat ───────────────────────────────────────────────────
// The bidders: each has a private estimate of the lot (lognormal error) and a nerve — the share
// of their own estimate they will go to. They take the ask whenever it is still under that.
function makeBidders(n, value, purse, rnd) {
    return Array.from({ length: n }, (_, i) => {
        const err = Math.exp((rnd() + rnd() + rnd() - 1.5) * 0.55);   // ~lognormal, fat-ish
        const nerve = 0.7 + rnd() * 0.7;                              // 0.7×–1.4× their own estimate
        return { i, cap: value * err * nerve, purse };
    });
}

function playLot({ value, openAsk, bidders, rule, trace, seed = 0 }) {
    const onBid = RULES[rule];
    let price = 0, soft = 0, closing = 0, leader = null, bids = 0, ms = 0;
    const startSoft = rule === 'seed' ? seed : 0;
    const log = [];
    // The opening ask ladder is the auctioneer fishing: he comes down, quicker each time.
    const asks = [];
    for (let a = openAsk, k = 0; k < CLOCK.ASK_WINDOWS.length; k++, a = Math.max(1, Math.round(a * 0.65))) asks.push(a);
    let askIdx = 0;

    let justBid = false;
    for (let beat = 0; beat < 400; beat++) {
        const opening = price === 0;
        const ask = opening ? asks[askIdx] : price + RAISE.softMinRaise(price, soft);
        // A bid always buys back the longest window on the board — that is a guarantee of the
        // shipped clock (unit-tested), and it is what stops a softened ask also meaning a rushed
        // one. Only an UNANSWERED beat gets the shorter window.
        const window = opening ? CLOCK.ASK_WINDOWS[Math.min(askIdx, CLOCK.ASK_WINDOWS.length - 1)]
            : justBid ? CLOCK.GAVEL_MS
                : closing ? CLOCK.CLOSE_BEAT_MS
                    : soft > 0 ? CLOCK.SOFT_WINDOWS[Math.min(soft - 1, CLOCK.SOFT_WINDOWS.length - 1)]
                        : CLOCK.GAVEL_MS;
        justBid = false;
        // Who would take it at that? Not the bidder already holding it — he is bidding against
        // himself otherwise, which the host forbids.
        const keen = bidders.filter(b => b !== leader && b.cap >= ask && b.purse >= ask);
        // Hesitation: the further the ask is under their number the more likely they move now.
        const bite = keen.find(b => rnd_(b, beat) < (opening ? 0.55 : 0.8) * Math.min(1, (b.cap - ask) / Math.max(1, b.cap * 0.35) + 0.25));
        if (trace) log.push(`${(ms / 1000).toFixed(1)}s  ${opening ? 'ASK' : closing ? (closing === 1 ? 'ONCE' : 'TWICE') : 'ask'} ${ask}${bite ? `  ← bidder ${bite.i} takes it` : ''}`);
        if (bite) {
            ms += Math.round(window * (0.25 + 0.6 * Math.random()));
            price = ask; leader = bite; bids++;
            soft = opening ? startSoft : onBid(soft);
            closing = 0; justBid = true;
            continue;
        }
        ms += window;
        if (opening) {
            if (askIdx < asks.length - 1) { askIdx++; continue; }
            return { passed: true, price: 0, bids, ms, log, soft };     // nobody opened it
        }
        if (soft < RAISE.askLadderFor(price).length - 1) { soft++; continue; }
        if (closing < CLOCK.CLOSE_BEATS) { closing++; continue; }
        return { passed: false, price, bids, ms, log, winner: leader, soft };
    }
    return { passed: false, price, bids, ms, log, winner: leader, ranOn: true };
}

// A deterministic-ish per-bidder-per-beat roll, so the same lot under every rule meets
// the same bidders in the same mood — otherwise the comparison is measuring noise.
let seedSalt = 0;
const rnd_ = (b, beat) => {
    let x = Math.sin((b.i + 1) * 374761 + beat * 668265 + seedSalt) * 43758.5453;
    return x - Math.floor(x);
};
const rnd = () => Math.random();

// ── the sweep ───────────────────────────────────────────────────────────────
const N = arg('lots', 3000);
const PLAYERS = arg('players', 4);
const PURSE = arg('cash', 7000);

function run(rule) {
    const st = { bids: [], ms: [], ratio: [], soft: [], passed: 0, n: 0 };
    const recent = []; let seed = 0;
    for (let t = 0; t < N; t++) {
        seedSalt = t * 1000;
        const lot = LOTS[Math.floor((t * 7919) % LOTS.length)];
        if (lot.value > PURSE * 0.9) continue;                 // unaffordable lots are the other sim's problem
        const openAsk = Math.round(lot.value * (0.85 + Math.random() * 1.05));
        const bidders = makeBidders(PLAYERS, lot.value, PURSE, rnd);
        const r = playLot({ value: lot.value, openAsk, bidders, rule, seed });
        st.n++;
        if (r.passed) { st.passed++; continue; }
        st.bids.push(r.bids);
        st.ms.push(r.ms);
        st.ratio.push(r.price / lot.value);
        st.soft.push(r.soft);
        // What the room's appetite looked like, for the rules that remember it: the rung the last
        // few lots settled at, one back so he still gives them the chance to surprise him.
        recent.push(r.soft); if (recent.length > 3) recent.shift();
        seed = Math.max(0, Math.round(mean(recent)) - 1);
    }
    return st;
}

const mean = a => a.reduce((x, y) => x + y, 0) / (a.length || 1);
const pct = (a, p) => { const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] || 0; };

if (arg('trace')) {
    const lot = LOTS.find(l => l.value > 200 && l.value < 900);
    console.log(`\nOne lot, beat by beat — ${lot.emoji} ${lot.name}, worth ${lot.value}\n`);
    for (const rule of Object.keys(RULES)) {
        seedSalt = 12345;
        const bidders = makeBidders(PLAYERS, lot.value, PURSE, rnd);
        const r = playLot({ value: lot.value, openAsk: Math.round(lot.value * 1.4), bidders, rule, trace: true });
        console.log(`── ${rule} ──`);
        console.log(r.log.map(l => '   ' + l).join('\n'));
        console.log(`   → ${r.passed ? 'PASSED IN' : `sold at ${r.price} (${(r.price / lot.value * 100).toFixed(0)}% of value)`} · ${r.bids} taps · ${(r.ms / 1000).toFixed(1)}s\n`);
    }
    process.exit(0);
}

console.log(`\nGoing, Going, GONE! — the auctioneer's ask, four candidate rules`);
console.log(`${N} lots · ${PLAYERS} bidders · ${PURSE} coins each\n`);
console.log('rule    taps/lot   worst 10%   seconds/lot   price/value   over-value   passed in');
console.log('─────────────────────────────────────────────────────────────────────────────────');
for (const rule of Object.keys(RULES)) {
    const s = run(rule);
    const secs = mean(s.ms) / 1000 + (CLOCK.INTRO_MS + CLOCK.SOLD_MS) / 1000;
    const over = s.ratio.filter(r => r > 1).length / (s.ratio.length || 1);
    console.log(
        `${rule.padEnd(8)}${mean(s.bids).toFixed(1).padStart(6)}` +
        `${pct(s.bids, 0.9).toFixed(0).padStart(12)}` +
        `${secs.toFixed(1).padStart(14)}` +
        `${(mean(s.ratio) * 100).toFixed(0).padStart(13)}%` +
        `${(over * 100).toFixed(0).padStart(12)}%` +
        `${(s.passed / s.n * 100).toFixed(0).padStart(11)}%`);
}
console.log(`
  taps/lot     how many times a phone is tapped before the hammer — the room's effort
  worst 10%    the 90th-percentile lot: the grindiest one in ten
  seconds/lot  intro + the whole call + the sold card, i.e. what a lot costs the evening
  price/value  what it fetched against what it is really worth
  over-value   share of lots that went for more than they are worth (the game's whole joke)
`);
