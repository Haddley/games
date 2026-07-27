#!/usr/bin/env node
// Going, Going, GONE! — a balance simulator.
//
// We have been guessing at the numbers: is $15,000 the right purse? does one lot worth
// $19,799 flatten the other seventeen? how often is somebody locked out of bidding? Those are
// arithmetic questions and deserve arithmetic answers, so this plays thousands of auctions
// and reports what actually happens.
//
// It is deliberately NOT the game. It models the only three things that decide balance:
// what the lots are worth, how wrong players are about that, and how boldly they bid. If it
// says a setting is bad, that is a real finding; if it says a setting is fine, the game still
// has to be played by humans to know.
//
//   node sim/goinggone.js
//   node sim/goinggone.js --players 6 --cash 15000 --games 5000
//   node sim/goinggone.js --compare        # sweep the settings we are choosing between
//
// Every knob is a flag so nobody has to edit the file to ask a question.

const arg = (k, d) => {
    const i = process.argv.indexOf('--' + k);
    if (i < 0) return d;
    const v = process.argv[i + 1];
    return v === undefined || v.startsWith('--') ? true : (isNaN(+v) ? v : +v);
};

// ── the lots ────────────────────────────────────────────────────────────────
// An EVEN spread across $1–$10,000 (the decision taken), plus optional monster lots above
// the band that keep their full value.
function makeLots(n, { monsters = 0, monsterValue = 19799, max = 10000, rnd }) {
    const lots = [];
    for (let i = 0; i < n - monsters; i++) {
        // even across the band: pick a band, then a value inside it, so a small sample still
        // spans the range instead of clumping
        const band = i % 5;
        const lo = [1, 100, 500, 2000, 5000][band], hi = [100, 500, 2000, 5000, max][band];
        lots.push({ value: Math.round(lo + rnd() * (hi - lo)), monster: false });
    }
    for (let i = 0; i < monsters; i++) lots.push({ value: monsterValue, monster: true });
    // shuffle, unless we are deliberately saving the monster for last
    for (let i = lots.length - 1; i > 0; i--) {
        const j = Math.floor(rnd() * (i + 1));
        [lots[i], lots[j]] = [lots[j], lots[i]];
    }
    if (arg('monster-last', false) && monsters) {
        const m = lots.findIndex(l => l.monster);
        if (m >= 0) lots.push(lots.splice(m, 1)[0]);
    }
    return lots;
}

// ── the players ─────────────────────────────────────────────────────────────
// Each one misjudges every lot, and some are bolder than others. `err` is how wrong they
// are (log-normal-ish, so being 2× out is common and 10× out is rare); `nerve` is the
// fraction of their estimate they will actually bid up to.
function makePlayers(n, cash, rnd) {
    return Array.from({ length: n }, (_, i) => ({
        i, cash, spent: 0, shelf: 0, won: 0,
        skill: 0.35 + rnd() * 0.5,          // lower = wilder guesses
        nerve: 0.55 + rnd() * 0.4,          // fraction of their estimate they'll pay
        lockedOutLots: 0,
    }));
}
const guess = (p, lot, rnd) => {
    // multiplicative error: people are wrong by a FACTOR, not by a fixed number of dollars
    const spread = (1 - p.skill) * 1.6;
    const f = Math.exp((rnd() + rnd() + rnd() - 1.5) * spread);
    return Math.max(1, lot.value * f);
};

// ── one auction ─────────────────────────────────────────────────────────────
function runGame(cfg, rnd) {
    const players = makePlayers(cfg.players, cfg.cash, rnd);
    const lots = makeLots(cfg.lots, { ...cfg, rnd });
    let passedIn = 0;

    for (const lot of lots) {
        // what each player is willing to pay, capped by what they have
        const ceilings = players.map(p => {
            const want = guess(p, lot, rnd) * p.nerve;
            return Math.min(want, p.cash);
        });
        const canBid = ceilings.map(c => c >= 1);
        players.forEach((p, i) => { if (!canBid[i]) p.lockedOutLots++; });

        const order = ceilings.map((c, i) => [c, i]).sort((a, b) => b[0] - a[0]);
        const [top, topI] = order[0];
        const second = order[1] ? order[1][0] : 0;
        if (top < 1) { passedIn++; continue; }                 // nobody can afford it

        // ascending auction settles just above the second-highest willingness to pay
        const price = Math.max(1, Math.min(top, Math.round(second + 1)));
        const w = players[topI];
        w.cash -= price; w.spent += price; w.shelf += lot.value; w.won++;
    }

    const rows = players.map(p => ({ ...p, net: p.cash + p.shelf }))
        .sort((a, b) => b.net - a.net);
    // did ONE lot decide it? true when the winner's best single bargain exceeds the gap to 2nd
    const winner = rows[0];
    const margin = rows[0].net - (rows[1] ? rows[1].net : 0);
    return { rows, passedIn, margin, winnerProfit: winner.shelf - winner.spent, lots };
}

// ── many auctions ───────────────────────────────────────────────────────────
function study(cfg, games = 2000) {
    let seed = 12345;
    const rnd = () => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    const out = { lockedOut: 0, passedIn: 0, margins: [], nets: [], monsterWins: 0, wonNothing: 0 };
    for (let g = 0; g < games; g++) {
        const r = runGame(cfg, rnd);
        out.passedIn += r.passedIn;
        out.margins.push(r.margin);
        r.rows.forEach(p => {
            out.nets.push(p.net);
            if (p.won === 0) out.wonNothing++;
            out.lockedOut += p.lockedOutLots;
        });
        // did the game's winner also win a monster lot?
        if (cfg.monsters) {
            const mv = cfg.monsterValue;
            if (r.rows[0].shelf >= mv) out.monsterWins++;
        }
    }
    const n = games * cfg.players;
    const pct = x => (100 * x).toFixed(1) + '%';
    const med = a => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];
    return {
        'players': cfg.players,
        'cash': '$' + cfg.cash.toLocaleString(),
        'lots': cfg.lots,
        'monsters': cfg.monsters,
        'median final': '$' + Math.round(med(out.nets)).toLocaleString(),
        'median margin': '$' + Math.round(med(out.margins)).toLocaleString(),
        'won nothing': pct(out.wonNothing / n),
        'locked out (per player-lot)': pct(out.lockedOut / (n * cfg.lots)),
        'passed in (per lot)': pct(out.passedIn / (games * cfg.lots)),
        'monster won the game': cfg.monsters ? pct(out.monsterWins / games) : '—',
    };
}

const base = {
    players: arg('players', 6),
    cash: arg('cash', 15000),
    lots: arg('lots', 0) || arg('players', 6) * 3,
    monsters: arg('monsters', 1),
    monsterValue: arg('monster-value', 19799),
    max: arg('max', 10000),
};
const games = arg('games', 2000);

if (arg('compare', false)) {
    const rows = [];
    for (const cash of [5000, 10000, 15000, 25000]) {
        for (const monsters of [0, 1]) {
            rows.push(study({ ...base, cash, monsters }, games));
        }
    }
    console.table(rows);
} else {
    console.table([study(base, games)]);
}
