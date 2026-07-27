// ─────────────────────────────────────────────────────────────────────────────
// bracket.js — a single-elimination knockout draw, shared.
//
// Pulled out of ticktacktoe, where it ran the TV tournament, so that any game can offer a
// knockout as an alternative to whatever it does normally. RPS is the first taker: its
// ordinary mode is a battle royale (everyone throws at once, everyone on the losing symbol
// goes out), and a bracket is a genuinely different evening — two people at a time, everyone
// else watching one screen.
//
// This file is PURE LOGIC. No DOM, no peers, no rendering: a bracket is a list of rounds, a
// round is a list of matches, a match is two seat indexes and a winner. Games decide what a
// "match" means — three tic-tac-toe boards, or first to two RPS throws.
//
//   const b = makeBracket(5);        // 5 players → byes in round 1
//   nextMatch(b)                     // → {r, m, a, b} the next one to play (null if done)
//   reportWinner(b, seatIndex)       // advance them; returns the champion when it's over
//   roundName(b, r)                  // "Quarter-final" · "Semi-final" · "Final"
//
// The awkward part is BYES, and it is the reason this is worth sharing rather than writing
// twice: player counts are rarely a power of two, so somebody has to sit a round out, and it
// must be a defensible somebody. Byes go to the TOP seeds — the earliest entrants — which is
// the convention every real tournament uses, and they are given in round 1 only.
// ─────────────────────────────────────────────────────────────────────────────

// How many first-round matches a field of `n` needs, and how many byes that leaves.
// A 5-player field plays 1 match (2 players) and gives 3 byes, leaving 4 for round 2.
function bracketShape(n) {
    if (n < 2) return { matches: 0, byes: n, size: n };
    let size = 1;
    while (size < n) size *= 2;                       // the next power of two at or above n
    const byes = size - n;                            // that many players skip round 1
    return { matches: (n - byes) / 2, byes, size };
}

// Build the draw. `seats` is however the game identifies its players — indexes, ids, names;
// this file never looks inside them. Rounds are filled in as the games are played.
function makeBracket(seats) {
    const list = Array.isArray(seats) ? seats.slice() : [];
    const n = list.length;
    const shape = bracketShape(n);
    const rounds = [];
    if (n < 2) return { seats: list, rounds, champion: n === 1 ? list[0] : null, shape };

    // Round 1: the byes are the first `byes` seats, the rest pair off in order.
    const playing = list.slice(shape.byes);
    const first = [];
    for (let i = 0; i < playing.length; i += 2) {
        first.push({ a: playing[i], b: playing[i + 1], w: null });
    }
    rounds.push(first);
    return { seats: list, rounds, champion: null, shape, byes: list.slice(0, shape.byes) };
}

// The next match that still needs a winner, or null when the tournament is over.
function nextMatch(b) {
    if (!b || !b.rounds) return null;
    for (let r = 0; r < b.rounds.length; r++) {
        for (let m = 0; m < b.rounds[r].length; m++) {
            if (b.rounds[r][m].w == null) return { r, m, a: b.rounds[r][m].a, b: b.rounds[r][m].b };
        }
    }
    return null;
}

// Record a winner for the current match and build the next round when this one is complete.
// Returns the champion once there is one, otherwise null.
function reportWinner(b, winner) {
    const cur = nextMatch(b);
    if (!cur) return b ? b.champion : null;
    const match = b.rounds[cur.r][cur.m];
    // only one of the two can win it; anything else is ignored rather than corrupting the draw
    if (winner !== match.a && winner !== match.b) return null;
    match.w = winner;

    if (b.rounds[cur.r].some(x => x.w == null)) return null;      // round still in progress

    // Round complete. The winners advance — joined, in round 1 only, by anyone who had a bye.
    const winners = b.rounds[cur.r].map(x => x.w);
    const through = cur.r === 0 ? (b.byes || []).concat(winners) : winners;
    if (through.length === 1) { b.champion = through[0]; return b.champion; }
    const next = [];
    for (let i = 0; i < through.length; i += 2) next.push({ a: through[i], b: through[i + 1], w: null });
    b.rounds.push(next);
    return null;
}

// What to call the round the given index is — counted back from the final, which is what
// people actually recognise. A round of 8 is the quarter-final regardless of how many rounds
// came before it.
function roundName(b, r) {
    if (!b || !b.rounds || !b.rounds[r]) return '';
    const left = b.rounds[r].length * 2;
    if (left <= 2) return 'Final';
    if (left <= 4) return 'Semi-final';
    if (left <= 8) return 'Quarter-final';
    return 'Round of ' + left;
}

// Everyone still in it — the winners so far plus anyone yet to play.
function stillIn(b) {
    if (!b || !b.rounds || !b.rounds.length) return b && b.seats ? b.seats.slice() : [];
    if (b.champion != null) return [b.champion];
    const last = b.rounds[b.rounds.length - 1];
    const out = [];
    last.forEach(m => {
        if (m.w != null) { out.push(m.w); return; }
        if (m.a != null) out.push(m.a);
        if (m.b != null) out.push(m.b);
    });
    return out;
}

// Knocked out, earliest first — which is exactly what rankByElimination wants.
function knockedOut(b) {
    const out = [];
    if (!b || !b.rounds) return out;
    b.rounds.forEach(round => round.forEach(m => {
        if (m.w == null) return;
        const loser = m.w === m.a ? m.b : m.a;
        if (loser != null) out.push(loser);
    }));
    return out;
}
