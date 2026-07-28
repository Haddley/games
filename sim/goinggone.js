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
// These tiers, the round window, the reserve and OVER_BAND MUST match goinggone.html. If they
// drift, this file stops describing the shipped game and its numbers become fiction.
const TIERS = [[1, 100], [100, 1000], [1000, 5000], [5000, 10000], [10000, 50000], [50000, Infinity]];
const BAND_SPAN = 4;            // how many neighbouring tiers a single round deals from
const MAX_CLIMB = 2;            // how far the window has slid by the final round
const OVER_BAND = 10000;        // "big lot" territory
const RESERVE_FRAC = 0.25;      // the withdrawal floor: the ask never drops below this share of value

// THE AUCTIONEER'S ASK. Bidding no longer opens at nothing — the auctioneer calls for an opening
// bid, and he is not an honest man. The ask starts somewhere either side of what the thing is
// really worth, and if nobody bites he comes down, and down, until he would go under the reserve
// and withdraws the lot instead. So the ask is a CLUE with a lie built into it, and holding out
// for the next drop is a game of nerve: wait too long and somebody else takes it, or it is
// wheeled off the stage entirely.
const REACH = 0.45;             // a lot's reserve may not demand more than this share of the richest bankroll
const ASK_HI = 1.9, ASK_LO = 0.85;      // opening ask as a share of true value — sometimes a gift
const DROP_HI = 0.75, DROP_LO = 0.55;   // each "nobody? then who'll give me…" step
const ASK_STEPS = 5;                    // most he will ever come down before withdrawing

// Round to two significant figures — auctioneers ask for $48,000, never $47,318.
const roundAsk = v => {
    if (v < 20) return Math.max(1, Math.round(v));
    const mag = Math.pow(10, Math.floor(Math.log10(v)) - 1);
    return Math.round(v / mag) * mag;
};

// The whole descending ladder for one lot, computed up front: [opening ask, …, last ask].
function askLadder(value, rnd) {
    const floor = value * RESERVE_FRAC;
    let a = value * (ASK_LO + rnd() * (ASK_HI - ASK_LO));
    const out = [];
    while (out.length < ASK_STEPS && a >= floor) {
        const r = roundAsk(a);
        if (r >= floor && (!out.length || r < out[out.length - 1])) out.push(r);
        a *= DROP_LO + rnd() * (DROP_HI - DROP_LO);
    }
    return out.length ? out : [Math.max(1, Math.round(floor))];
}

// The window of tiers a given round deals from. Round 1 is always the ordinary spread; the final
// round has climbed as far as it goes, so a table that has banked two rounds of winnings gets
// shown the lots it can now actually afford.
function roundBands(round, rounds) {
    const climb = rounds <= 1 ? 0 : Math.round(((round - 1) / (rounds - 1)) * MAX_CLIMB);
    return TIERS.slice(climb, climb + BAND_SPAN);
}
const reserveFor = value => Math.round(value * RESERVE_FRAC);

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
        const [lo, hi] = TIERS[i % BAND_SPAN];
        return { value: Math.round(lo + rnd() * (Math.min(hi, max) - lo)) };
    });
}

// Deal evenly across this round's bands, exactly as buildLotOrder does, so a short auction still
// spans the whole range instead of clumping. Then optionally one over-band "big lot".
// `used` is the whole game's draw so far — a multi-round game never sells the same item twice.
// `ceiling` is the richest bankroll at the table: a tier whose cheapest lot has a reserve nobody
// could clear is dropped, because a lot that cannot sell is a gap in the running order, not drama.
function drawLots(pool, n, big, rnd, bands, used, ceiling) {
    // Affordability is judged LOT BY LOT, not tier by tier: the top tier runs from $50,000 to a
    // private aircraft, and "somebody could clear the cheapest thing in this tier" is not the same
    // question as "somebody could clear THIS". A lot nobody can reach is a withdrawal nobody
    // enjoyed, so it never reaches the running order.
    const avail = pool.filter(l => !used.has(l) && reserveFor(l.value) <= ceiling * REACH);
    const inBand = bands.map(([lo, hi]) => shuffled(avail.filter(l => l.value >= lo && l.value < hi), rnd));
    const topsOut = bands.some(([lo]) => lo >= OVER_BAND);            // window already reaches the monsters
    const overBand = shuffled(avail.filter(l => l.value >= OVER_BAND), rnd);
    const wantBig = (big && !topsOut && overBand.length) ? 1 : 0;
    const out = [];
    for (let i = 0; out.length < n - wantBig; i++) {
        const b = inBand[i % inBand.length];
        if (b.length) out.push(b.pop());
        else if (inBand.every(x => !x.length)) break;
        if (i > n * 8) break;                       // belt and braces against a starved pool
    }
    if (wantBig) out.push(overBand.pop());
    out.forEach(l => used.add(l));
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
// A game is `rounds` auctions back to back. Between them every shelf is sold back at its true
// value and the whole net worth becomes the next round's bankroll, so a good eye compounds — and
// the bands climb to meet the money.
function runGame(cfg, pool, rnd) {
    const players = makePlayers(cfg.players, cfg.cash, rnd);
    const rounds = Math.max(1, cfg.rounds || 1);
    const used = new Set();
    let passedIn = 0, dealt = 0, reserveFails = 0, tookADrop = 0, bankrolls = 0;
    const paidFrac = [], perRound = {};

    for (let round = 1; round <= rounds; round++) {
        const ceiling = Math.max(...players.map(p => p.cash));
        bankrolls += players.reduce((s, p) => s + p.cash, 0);   // money on the table THIS round
        const lots = drawLots(pool, cfg.lots, cfg.big, rnd, roundBands(round, rounds), used, ceiling);
        dealt += lots.length;

        for (const lot of lots) {
            const ceilings = players.map(p => Math.min(guess(p, lot, rnd) * p.nerve, p.cash));
            players.forEach((p, i) => { if (ceilings[i] < 1) p.lockedOutLots++; });
            const ladder = askLadder(lot.value, rnd);

            // Walk the auctioneer down his ladder until somebody opens the bidding.
            let opened = -1, openPrice = 0;
            for (let s = 0; s < ladder.length && opened < 0; s++) {
                const ask = ladder[s];
                const last = s === ladder.length - 1;                // next stop is the skip
                const keen = [];
                ceilings.forEach((c, i) => {
                    if (c < ask || players[i].cash < ask) return;
                    // Nerve: the bigger the margin they think they are getting, the more likely
                    // they pounce now rather than gamble on another drop. On the last ask it is
                    // take it or lose it, so everybody who can afford it bites.
                    const eager = Math.min(0.9, Math.max(0.12, (c - ask) / c * 1.7));
                    if (last || rnd() < eager) keen.push(i);
                });
                if (!keen.length) continue;
                opened = s; openPrice = ask;
                // Two or more want it → it goes ascending from the ask, settling just above the
                // second-highest willingness to pay, exactly as an English auction does.
                const rank = keen.map(i => [ceilings[i], i]).sort((a, b) => b[0] - a[0]);
                const price = rank.length > 1
                    ? Math.max(ask, Math.min(rank[0][0], Math.round(rank[1][0] + 1)))
                    : ask;
                const w = players[rank[0][1]];
                w.cash -= price; w.spent += price; w.shelf += lot.value; w.won++;
                w.best = Math.max(w.best, lot.value - price);        // their single biggest bargain
                openPrice = price;
            }
            const pr = (perRound[round] || (perRound[round] = { dealt: 0, gone: 0, paid: [] }));
            pr.dealt++;
            if (opened < 0) { passedIn++; reserveFails++; pr.gone++; }   // withdrawn — never made its reserve
            else if (opened > 0) tookADrop++;
            if (opened >= 0) { paidFrac.push(openPrice / lot.value); pr.paid.push(openPrice / lot.value); }
        }

        perRound[round].bank = players.reduce((s, p) => s + p.cash + p.shelf, 0) / cfg.players;
        // bank: the shelf turns back into coins and the next round bids with it
        if (round < rounds) players.forEach(p => { p.cash += p.shelf; p.shelf = 0; });
    }

    const rows = players.map(p => ({ ...p, net: p.cash + p.shelf })).sort((a, b) => b.net - a.net);
    const margin = rows[0].net - (rows[1] ? rows[1].net : 0);
    return {
        rows, passedIn, dealt, reserveFails, tookADrop, paidFrac, perRound, margin,
        // DID ONE LOT DECIDE IT? The winner's single best bargain is bigger than their whole lead,
        // i.e. take that one lot away and they lose. The old measure was "winner holds at least the
        // monster's value in stock", which reads ~100% as soon as there are several big lots and
        // told us nothing. Note this is naturally high in CLOSE games — a tiny margin is easy to
        // exceed — so read it next to margin/winner rather than on its own.
        oneLotDecided: margin > 0 && rows[0].best >= margin,
        closeness: margin / Math.max(1, rows[0].net),
        // share of the money that was ever on the table which actually got spent — summed over
        // rounds, because a banked round hands everyone a fresh (bigger) purse to spend
        spentFrac: rows.reduce((s, p) => s + p.spent, 0) / Math.max(1, bankrolls),
        growth: rows.reduce((s, p) => s + p.net, 0) / (cfg.players * cfg.cash),
    };
}

// ── many auctions ───────────────────────────────────────────────────────────
function study(cfg, pool, games) {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    let passedIn = 0, wonNothing = 0, lockedOut = 0, decided = 0, dealt = 0, reserveFails = 0, drops = 0;
    const closeness = [], spent = [], wonCounts = [], finals = [], paid = [], grew = [];
    for (let g = 0; g < games; g++) {
        const r = runGame(cfg, pool, rnd);
        passedIn += r.passedIn; dealt += r.dealt; reserveFails += r.reserveFails; drops += r.tookADrop;
        r.paidFrac.forEach(f => paid.push(f));
        closeness.push(r.closeness); spent.push(r.spentFrac); finals.push(r.rows[0].net); grew.push(r.growth);
        if (r.oneLotDecided) decided++;
        r.rows.forEach(p => { if (!p.won) wonNothing++; lockedOut += p.lockedOutLots; wonCounts.push(p.won); });
    }
    const n = games * cfg.players;
    const pct = x => (100 * x).toFixed(1) + '%';
    const med = a => a.slice().sort((x, y) => x - y)[a.length >> 1];
    return {
        players: cfg.players,
        rounds: Math.max(1, cfg.rounds || 1),
        'lots/round': cfg.lots,
        cash: '$' + cfg.cash.toLocaleString(),
        'big lot': cfg.big ? 'yes' : 'no',
        'winner net': '$' + Math.round(med(finals)).toLocaleString(),
        // The headline. An absolute margin means different things at $7k and $50k, so express the
        // winner's lead as a share of their own score.
        'margin/winner': pct(med(closeness)),
        'won nothing': pct(wonNothing / n),
        'med lots won': med(wonCounts),
        'purse spent': pct(med(spent)),
        // does the table get RICHER over the rounds? under 100% and the compounding never starts,
        // so the bands climb past the money and the last round is all withdrawals
        'net vs start': pct(med(grew)),
        'paid/value': pct(med(paid)),
        'took a drop': pct(drops / Math.max(1, dealt - passedIn)),
        'locked out': pct(lockedOut / Math.max(1, n * cfg.lots)),
        'withdrawn': pct(passedIn / Math.max(1, dealt)),
        'one lot decided': pct(decided / games),
    };
}

// Round by round: does the money keep up with the climbing bands? A last round where half the
// lots are withdrawn means the tiers outran the bankrolls.
function byRound(cfg, pool, games) {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const acc = {};
    for (let g = 0; g < games; g++) {
        const r = runGame(cfg, pool, rnd);
        Object.entries(r.perRound).forEach(([k, v]) => {
            const a = (acc[k] || (acc[k] = { dealt: 0, gone: 0, paid: [], bank: [] }));
            a.dealt += v.dealt; a.gone += v.gone; v.paid.forEach(p => a.paid.push(p)); a.bank.push(v.bank);
        });
    }
    const pct = x => (100 * x).toFixed(1) + '%';
    const med = a => a.length ? a.slice().sort((x, y) => x - y)[a.length >> 1] : 0;
    const rounds = Math.max(1, cfg.rounds || 1);
    return Object.keys(acc).map(k => ({
        round: k,
        bands: roundBands(+k, rounds).map(([lo, hi]) => '$' + lo + (hi === Infinity ? '+' : '-' + hi)).join(' '),
        'bankroll after': '$' + Math.round(med(acc[k].bank)).toLocaleString(),
        'paid/value': pct(med(acc[k].paid)),
        withdrawn: pct(acc[k].gone / acc[k].dealt),
    }));
}

// ── cli ─────────────────────────────────────────────────────────────────────
const games = arg('games', 4000);
const players = arg('players', 6);
const base = {
    players,
    cash: arg('cash', 7000),                    // the shipped START_COINS
    rounds: arg('rounds', 3),                   // the shipped default: three banked rounds
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
} else if (arg('by-round', false)) {
    console.table(byRound(base, pool, games));
} else if (arg('round-sweep', false)) {
    console.table([1, 2, 3, 4].map(rounds => study({ ...base, rounds }, pool, games)));
} else {
    console.table([study(base, pool, games)]);
}
