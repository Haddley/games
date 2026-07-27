#!/usr/bin/env node
// Going, Going, GONE! — a balance simulator.
//
// We were guessing at the numbers: is the purse right? does one enormous lot flatten the other
// seventeen? how often is somebody locked out of bidding? Those are arithmetic questions and
// deserve arithmetic answers, so this plays thousands of auctions and reports what happens.
//
// It reads the REAL researched lots by default (data/goinggone-lots-*.json) and draws them the
// same way the game does, so its verdict describes the game people actually play. `--synthetic`
// falls back to generated lots for asking what-if questions about value spreads we do not own.
//
//   node sim/goinggone.js                        # the shipped settings
//   node sim/goinggone.js --players 8 --cash 12000
//   node sim/goinggone.js --cash-sweep           # what does the purse do?
//   node sim/goinggone.js --big-sweep            # what does the big lot do?
//   node sim/goinggone.js --synthetic --max 700  # the old invented-lot world
//
// It is deliberately NOT the game. It models the only three things that decide balance: what the
// lots are worth, how wrong players are about that, and how boldly they bid. If it says a setting
// is bad that is a real finding; if it says a setting is fine, humans still have to play it.

const fs = require('fs');
const path = require('path');

const arg = (k, d) => {
    const i = process.argv.indexOf('--' + k);
    if (i < 0) return d;
    const v = process.argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : (isNaN(+v) ? v : +v);
};

// ── the lots ────────────────────────────────────────────────────────────────
// These bands MUST match BANDS/OVER_BAND in goinggone.html. If they drift, this file stops
// describing the shipped game and its numbers become fiction.
const BANDS = [[1, 100], [100, 1000], [1000, 5000], [5000, 10000]];
const OVER_BAND = 10000;

function loadRealLots() {
    const dir = path.resolve(__dirname, '..', 'data');
    return ['goinggone-lots-real.json', 'goinggone-lots-catalogue.json']
        .flatMap(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')).lots)
        .map(l => ({ value: Math.round(l.value) }))
        .filter(l => l.value > 0);
}

// Synthetic pool: an even spread across the band, for what-if questions.
function syntheticLots(max, rnd) {
    return Array.from({ length: 400 }, (_, i) => {
        const [lo, hi] = BANDS[i % BANDS.length];
        return { value: Math.round(lo + rnd() * (Math.min(hi, max) - lo)) };
    });
}

// Deal evenly across the bands, exactly as buildLotOrder does, so a short auction still spans the
// whole range instead of clumping. Then optionally one over-band "big lot".
function drawLots(pool, n, big, rnd) {
    const inBand = BANDS.map(([lo, hi]) => shuffled(pool.filter(l => l.value >= lo && l.value < hi), rnd));
    const overBand = shuffled(pool.filter(l => l.value >= OVER_BAND), rnd);
    const wantBig = (big && overBand.length) ? 1 : 0;
    const out = [];
    for (let i = 0; out.length < n - wantBig; i++) {
        const b = inBand[i % inBand.length];
        if (b.length) out.push(b.pop());
        else if (inBand.every(x => !x.length)) break;
        if (i > n * 8) break;                       // belt and braces against a starved pool
    }
    if (wantBig) out.push(overBand.pop());
    return shuffled(out, rnd);
}
function shuffled(a, rnd) {
    const r = a.slice();
    for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [r[i], r[j]] = [r[j], r[i]]; }
    return r;
}

// ── the players ─────────────────────────────────────────────────────────────
// Each misjudges every lot, and some are bolder than others. `skill` drives how wrong they are
// (multiplicatively — people are wrong by a FACTOR, not by a fixed number of dollars, so 2x out
// is common and 10x out is rare); `nerve` is the fraction of their estimate they will actually pay.
const makePlayers = (n, cash, rnd) => Array.from({ length: n }, (_, i) => ({
    i, cash, spent: 0, shelf: 0, won: 0, best: 0, lockedOutLots: 0,
    skill: 0.35 + rnd() * 0.5,
    nerve: 0.55 + rnd() * 0.4,
}));
const guess = (p, lot, rnd) => {
    const spread = (1 - p.skill) * 1.6;
    return Math.max(1, lot.value * Math.exp((rnd() + rnd() + rnd() - 1.5) * spread));
};

// ── one auction ─────────────────────────────────────────────────────────────
function runGame(cfg, pool, rnd) {
    const players = makePlayers(cfg.players, cfg.cash, rnd);
    const lots = drawLots(pool, cfg.lots, cfg.big, rnd);
    let passedIn = 0;

    for (const lot of lots) {
        const ceilings = players.map(p => Math.min(guess(p, lot, rnd) * p.nerve, p.cash));
        players.forEach((p, i) => { if (ceilings[i] < 1) p.lockedOutLots++; });

        const order = ceilings.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0]);
        if (order[0][0] < 1) { passedIn++; continue; }          // nobody can afford it: passed in

        // an ascending auction settles just above the second-highest willingness to pay
        const price = Math.max(1, Math.min(order[0][0], Math.round((order[1] ? order[1][0] : 0) + 1)));
        const w = players[order[0][1]];
        w.cash -= price; w.spent += price; w.shelf += lot.value; w.won++;
        w.best = Math.max(w.best, lot.value - price);           // their single biggest bargain
    }

    const rows = players.map(p => ({ ...p, net: p.cash + p.shelf })).sort((a, b) => b.net - a.net);
    const margin = rows[0].net - (rows[1] ? rows[1].net : 0);
    return {
        rows, passedIn, margin,
        // DID ONE LOT DECIDE IT? The winner's single best bargain is bigger than their whole lead,
        // i.e. take that one lot away and they lose. The old measure was "winner holds at least the
        // monster's value in stock", which reads ~100% as soon as there are several big lots and
        // told us nothing. Note this is naturally high in CLOSE games — a tiny margin is easy to
        // exceed — so read it next to margin/winner rather than on its own.
        oneLotDecided: margin > 0 && rows[0].best >= margin,
        closeness: margin / Math.max(1, rows[0].net),
        spentFrac: 1 - rows.reduce((s, p) => s + p.cash, 0) / (cfg.players * cfg.cash),
    };
}

// ── many auctions ───────────────────────────────────────────────────────────
function study(cfg, pool, games) {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let passedIn = 0, wonNothing = 0, lockedOut = 0, decided = 0;
    const closeness = [], spent = [], wonCounts = [];
    for (let g = 0; g < games; g++) {
        const r = runGame(cfg, pool, rnd);
        passedIn += r.passedIn; closeness.push(r.closeness); spent.push(r.spentFrac);
        if (r.oneLotDecided) decided++;
        r.rows.forEach(p => { if (!p.won) wonNothing++; lockedOut += p.lockedOutLots; wonCounts.push(p.won); });
    }
    const n = games * cfg.players;
    const pct = x => (100 * x).toFixed(1) + '%';
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    return {
        players: cfg.players,
        lots: cfg.lots,
        cash: '$' + cfg.cash.toLocaleString(),
        'big lot': cfg.big ? 'yes' : 'no',
        // The headline. An absolute margin means different things at $7k and $50k, so express the
        // winner's lead as a share of their own score.
        'margin/winner': pct(med(closeness)),
        'won nothing': pct(wonNothing / n),
        'med lots won': med(wonCounts),
        'purse spent': pct(med(spent)),
        'locked out': pct(lockedOut / (n * cfg.lots)),
        'passed in': pct(passedIn / (games * cfg.lots)),
        'one lot decided': pct(decided / games),
    };
}

// ── cli ─────────────────────────────────────────────────────────────────────
const games = arg('games', 4000);
const players = arg('players', 6);
const base = {
    players,
    cash: arg('cash', 7000),                    // the shipped START_COINS
    lots: arg('lots', 0) || players * arg('lots-per', 3),
    big: !!arg('big', false),
};

let pool;
if (arg('synthetic', false)) {
    let s = 999;
    const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    pool = syntheticLots(arg('max', 10000), r);
    console.log('pool: SYNTHETIC, even spread to $' + arg('max', 10000).toLocaleString());
} else {
    pool = loadRealLots();
    const ord = pool.filter(l => l.value < OVER_BAND).length;
    console.log(`pool: ${pool.length} real lots (${ord} ordinary, ${pool.length - ord} over-band)`);
}

if (arg('cash-sweep', false)) {
    console.table([5000, 6000, 7000, 8000, 9000, 10000, 15000].map(cash => study({ ...base, cash }, pool, games)));
} else if (arg('big-sweep', false)) {
    console.table([false, true].map(big => study({ ...base, big }, pool, games)));
} else if (arg('table-sweep', false)) {
    console.table([2, 3, 4, 6, 8, 10].map(p =>
        study({ ...base, players: p, lots: p * arg('lots-per', 3) }, pool, games)));
} else {
    console.table([study(base, pool, games)]);
}
