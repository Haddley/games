// ─────────────────────────────────────────────────────────────────────────────
// cards.js — shared card model + commentary helpers for the standard-deck games
// (kingscorner, blackjack, gofish, idoubtit). Loaded AFTER common.js and BEFORE
// each game's own inline <script>, same convention as every other shared file.
//
// Narrowly scoped on purpose (like dice.js/bracket.js) rather than folded into
// common.js: nothing here is used outside these four games, so a game that never
// touches a standard deck pays nothing for loading it.
//
// Keep this TINY and STABLE — a syntax error here breaks all four card games at
// once. Always run the smoke e2e after editing it.
// ─────────────────────────────────────────────────────────────────────────────

// ── Standard 52-card deck model ─────────────────────────────────────────────
const SUIT_SYM = { S: '♠', H: '♥', D: '♦', C: '♣' };
const SUIT_WORDS = { S: 'spades', H: 'hearts', D: 'diamonds', C: 'clubs' };
const RANK_WORDS = { 1: 'Ace', 2: 'Two', 3: 'Three', 4: 'Four', 5: 'Five', 6: 'Six', 7: 'Seven', 8: 'Eight', 9: 'Nine', 10: 'Ten', 11: 'Jack', 12: 'Queen', 13: 'King' };
const RANK_PLURAL = { 1: 'aces', 2: 'twos', 3: 'threes', 4: 'fours', 5: 'fives', 6: 'sixes', 7: 'sevens', 8: 'eights', 9: 'nines', 10: 'tens', 11: 'jacks', 12: 'queens', 13: 'kings' };

function rankName(n) { return RANK_WORDS[n] || String(n); }
function rankShort(n) { return n === 1 ? 'A' : n === 11 ? 'J' : n === 12 ? 'Q' : n === 13 ? 'K' : String(n); }
function cardLabel(c) { return rankShort(c.rank) + SUIT_SYM[c.suit]; }
function cardSpoken(c) { return `${rankName(c.rank)} of ${SUIT_WORDS[c.suit]}`; }

function makeCard(rank, suit) { return { rank, suit, id: rank + suit }; }
function makeDeck() {
    const suits = ['S', 'H', 'D', 'C'], out = [];
    for (const s of suits) for (let r = 1; r <= 13; r++) out.push(makeCard(r, s));
    return out;
}
function suitColor(suit) { return (suit === 'H' || suit === 'D') ? 'red' : 'black'; }
function shuffled(deck) {
    const a = deck.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    return a;
}
// The corner-indexed card face's inner markup — each game wraps this in its own
// themed card div (`.bj-card`, `.gf-card`, `.id-card`, kingscorner's `.kc-card`).
function cardHTML(c) { return `<span class="rk">${rankShort(c.rank)}</span><span class="su">${SUIT_SYM[c.suit]}</span>`; }

// ── Captain, host-can-also-play games ───────────────────────────────────────
// Unlike common.js's `capPlayer()` (gated on `isTvHost`, since a phone-hosted party
// game routes captain-gated actions through its own local shortcut instead), these
// four games need the captain concept to work identically whether TV-hosted or
// phone-hosted — a host who is also a player still needs `isCaptain` to resolve
// correctly for everyone at the table. This deliberately overrides common.js's
// version (later script wins) rather than being a stale duplicate of it.
function capPlayer() { return connectedPlayers()[0] || H.players[0] || null; }
// Re-syncs only the two phones the crown actually moved between, plus the TV/viewers —
// never a full broadcast(), which would interrupt every other player mid-interaction
// (e.g. mid card-select) just because someone else joined or dropped. `ui` is left
// untouched: a captain change never changes the phase, only who the crown-dependent
// fields (`isCaptain`, `captain` name) point at, so only the underlying D/vD data needs
// refreshing before the existing `ui` is repainted.
function capSync(prevId) {
    const newId = capPlayer()?.id || null;
    if (newId === prevId) return;
    const lobby = H.phase === 'lobby';
    [prevId, newId].forEach(id => {
        if (!id || id === myId) return;
        const c = guestConns[id];
        if (c) send(c, lobby ? lobbyMsg() : buildDisplay(id));
    });
    Object.values(viewerConns).forEach(c => send(c, lobby ? { ...lobbyMsg(), type: 'viewer_lobby' } : buildViewerDisplay()));
    if (typeof isTvHost !== 'undefined' && isTvHost) {
        vD = lobby ? { ...lobbyMsg(), type: 'viewer_lobby' } : buildViewerDisplay();
        render();
    } else if (isHost) {
        D = lobby ? lobbyMsg() : buildDisplay(myId);
        render();
    }
}

// ── Milestone commentary (spoken + shown) ───────────────────────────────────
function addMilestone(text, speech) {
    H.milestoneSeq++;
    H.milestones.push({ seq: H.milestoneSeq, text, speech: speech || text });
    if (H.milestones.length > 8) H.milestones = H.milestones.slice(-8);
}
// `voiceOn()` stays per-game (its default fallback differs slightly by game — see
// each game's own definition) — `speak`/`canSpeak`/`syncVoiceBtn`/`primeSpeech`/`joinSpeech`
// moved to common.js once Liar's Dice and Last Card became consumers with no deck of their own.
