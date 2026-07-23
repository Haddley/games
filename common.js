// ─────────────────────────────────────────────────────────────────────────────
// common.js — small, stable shared core for the multiplayer games.
//
// Loaded via  <script src="common.js"></script>  in each game's <head>, BEFORE
// the game's own inline <script>, so the names below become globals the game
// uses directly (no build step, no modules — this is a classic script).
//
// Keep this TINY and STABLE: a syntax error here breaks EVERY game at once, so
// only truly identical, rarely-changing primitives belong here. Each game is
// otherwise still a self-contained file.
// ─────────────────────────────────────────────────────────────────────────────

// TURN relay (Metered) so players on restrictive / remote networks (symmetric
// NAT, mobile carriers, corporate wifi) can connect — STUN alone only punches
// through friendly NATs. Passed to EVERY `new Peer(...)`:
//   host   → new Peer(id, ICE_CFG)          guest/viewer → new Peer(undefined, ICE_CFG)
// The credentials are public (free tier, ~50 GB/mo shared). To ROTATE a burned
// quota: get a new key from the Metered dashboard and change it here — once,
// instead of ~4× across every game (ticktacktoe still inlines its own copy).
const ICE_CFG = { config: { iceServers: [
    { urls: 'stun:stun.relay.metered.ca:80' },
    { urls: 'turn:standard.relay.metered.ca:80', username: '35410ce7572a64d0dad7b813', credential: 'Tmwfl6WHxuBNXj2G' },
    { urls: 'turn:standard.relay.metered.ca:80?transport=tcp', username: '35410ce7572a64d0dad7b813', credential: 'Tmwfl6WHxuBNXj2G' },
    { urls: 'turn:standard.relay.metered.ca:443', username: '35410ce7572a64d0dad7b813', credential: 'Tmwfl6WHxuBNXj2G' },
    { urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: '35410ce7572a64d0dad7b813', credential: 'Tmwfl6WHxuBNXj2G' }
] } };

// Competition ranking (1-2-2-4): equal scores share a place, so tied players
// get the SAME medal/place. Input `list` must already be sorted by score
// descending; pass `key` for a non-default score field (e.g. 'totalScore', 'net').
function rankByScore(list, key = 'score') {
    let rank = 0;
    return list.map((p, i) => { if (i > 0 && p[key] < list[i - 1][key]) rank = i; return rank; });
}
