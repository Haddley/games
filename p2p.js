// ─────────────────────────────────────────────────────────────────────────────
// p2p.js — shared PeerJS core for the games (loaded after common.js).
//
// Every game is host-authoritative over PeerJS: the host registers a room peer
// `<PREFIX><CODE>`, guests/viewers connect to it. This file factors out the two
// things every game copy-pasted AND that most games were missing hardening for:
//   • host RECONNECT resilience — the PeerJS broker periodically drops the room's
//     socket, de-registering the id so new guests get `peer-unavailable`; reconnect
//     to re-list the room instead of tearing it down.
//   • guest/viewer JOIN retry — `peer-unavailable` and WebRTC negotiation failures
//     are often transient; retry a couple of times before giving up.
//   • guest/viewer REJOIN — a connection that drops MID-GAME (phone sleeps, wifi
//     blip, carrier hand-off) auto-rejoins behind a "Reconnecting…" curtain instead
//     of dumping the player home. The host keeps their slot warm (zombie takeover
//     by name), so score/hand/crown survive the round trip. A game opts in simply
//     by passing `onLost` to joinPeer().
//   • RELAY reporting — polls the live RTCPeerConnection and tells common.js to
//     show the 📡 badge whenever traffic is going through the TURN relay rather
//     than straight peer-to-peer.
//
// Each game still owns its globals (peer, hostConn, roomCode, ui, …), its peer-id
// PREFIX, and its message handling — these helpers just wrap the connection
// lifecycle. They use `ICE_CFG` from common.js. Because they're only *called* from
// host/join actions (never at load), a missing/stale p2p.js can't blank a page.
// ─────────────────────────────────────────────────────────────────────────────

// Room codes: 4 letters from a no-I/O alphabet (avoids 1/0 confusion).
const P2P_ROOM_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
function makeRoomCode() {
    let s = '';
    for (let i = 0; i < 4; i++) s += P2P_ROOM_CHARS[Math.floor(Math.random() * P2P_ROOM_CHARS.length)];
    return s;
}

// Broker/network blips that should reconnect rather than tear the room down.
function isRecoverablePeerError(e) {
    return !!(e && (e.type === 'network' || e.type === 'disconnected' || e.type === 'server-error'
        || e.type === 'socket-error' || e.type === 'socket-closed'));
}

// ── "Reconnecting…" curtain ─────────────────────────────────────────────────
// Self-contained (own markup + CSS) so no game needs to add anything for it.
const P2P_CURTAIN_CSS = `
#p2p-curtain { position: fixed; inset: 0; z-index: 9000; display: flex; align-items: center; justify-content: center;
    background: rgba(10,7,22,.82); -webkit-backdrop-filter: blur(5px); backdrop-filter: blur(5px); padding: 20px; }
#p2p-curtain .p2p-card { max-width: 320px; text-align: center; color: #fff; font-weight: 800;
    background: rgba(38,28,68,.92); border: 1px solid rgba(255,255,255,.18); border-radius: 16px; padding: 22px 20px;
    box-shadow: 0 18px 44px rgba(0,0,0,.45); }
#p2p-curtain .p2p-dots { font-size: 2rem; line-height: 1; margin-bottom: 10px; animation: p2pPulse 1.1s ease-in-out infinite; }
#p2p-curtain .p2p-sub { margin-top: 8px; font-size: .78rem; font-weight: 700; opacity: .72; }
@keyframes p2pPulse { 0%,100% { opacity: .35; transform: scale(.94); } 50% { opacity: 1; transform: scale(1.06); } }
body.day #p2p-curtain { background: rgba(255,255,255,.80); }
body.day #p2p-curtain .p2p-card { background: #fff; color: #1b1830; border-color: rgba(0,0,0,.12); }
@media (prefers-reduced-motion: reduce) { #p2p-curtain .p2p-dots { animation: none; opacity: .9; } }
`;
function p2pCurtain(show, text) {
    if (typeof document === 'undefined') return;
    const cur = document.getElementById('p2p-curtain');
    if (!show) { if (cur) cur.remove(); return; }
    if (cur) return;
    if (!document.getElementById('p2p-curtain-style')) {
        const st = document.createElement('style'); st.id = 'p2p-curtain-style'; st.textContent = P2P_CURTAIN_CSS;
        document.head.appendChild(st);
    }
    const d = document.createElement('div');
    d.id = 'p2p-curtain';
    d.innerHTML = `<div class="p2p-card"><div class="p2p-dots">📶</div>${text || 'Reconnecting…'}
        <div class="p2p-sub">Your place in the game is saved.</div></div>`;
    document.body.appendChild(d);
}

// ── Relay (TURN) detection ──────────────────────────────────────────────────
// WebRTC only relays when the two peers can't reach each other directly. Knowing
// which it is matters: relayed play burns the shared TURN quota and adds latency.
// Any relayed connection lights the badge (the host may hold several at once).
const _p2pPath = new Map();         // conn.peer → 'relay' | 'stun' | 'local'
const _p2pWatched = new Set();      // connections that are live right now
function _p2pRelaySync() {
    // Worst/most notable path wins: a host holding several connections shows 📡 if
    // ANY of its players is being relayed.
    const paths = [..._p2pPath.values()];
    const state = !_p2pWatched.size ? 'none'
        : paths.includes('relay') ? 'relay'
        : paths.includes('stun') ? 'stun'
        : paths.includes('local') ? 'local'
        : 'checking';
    if (typeof setNetState === 'function') setNetState(state);
    else if (typeof setRelayBadge === 'function') setRelayBadge(state === 'relay');   // older common.js
}
function p2pIsRelayed() { return [..._p2pPath.values()].includes('relay'); }
function p2pPath() {
    const paths = [..._p2pPath.values()];
    return paths.includes('relay') ? 'relay' : paths.includes('stun') ? 'stun' : paths.includes('local') ? 'local' : null;
}

// Which mechanism got these two devices talking, from the ICE candidate types:
//   relay          — a TURN candidate (WebKit has historically spelled it 'relayed')
//   srflx / prflx  — an address a STUN server (or the peer itself) revealed: the two
//                    NATs were hole-punched and now talk directly
//   host           — a plain local address: same wifi/LAN, no server involved
function _p2pCandKind(c) {
    const t = c && c.candidateType;
    if (t === 'relay' || t === 'relayed') return 'relay';
    if (t === 'srflx' || t === 'prflx' || t === 'serverreflexive' || t === 'peerreflexive') return 'stun';
    if (t === 'host') return 'local';
    return null;
}
function _p2pPairKind(a, b) {
    const ka = _p2pCandKind(a), kb = _p2pCandKind(b);
    if (ka === 'relay' || kb === 'relay') return 'relay';
    if (ka === 'stun' || kb === 'stun') return 'stun';
    if (ka === 'local' || kb === 'local') return 'local';
    return null;
}

// Walk getStats() for the *selected* candidate pair and see whether either end of
// it is a TURN candidate. Polls, because ICE can re-nominate onto a relay later.
// Browsers disagree about how to mark the chosen pair, so try in order:
// transport.selectedCandidatePairId → nominated/selected succeeded pair → any
// succeeded pair. If none of those exist, fall back to "are ALL candidates relay".
function p2pWatchRelay(conn) {
    if (!conn || typeof conn.on !== 'function') return;
    let dead = false, tries = 0;
    _p2pWatched.add(conn.peer);
    conn.on('close', () => {
        dead = true;
        _p2pPath.delete(conn.peer); _p2pWatched.delete(conn.peer);
        _p2pRelaySync();
    });
    const tick = () => {
        if (dead || tries++ > 200) return;
        const pc = conn.peerConnection;
        if (!pc || typeof pc.getStats !== 'function') { setTimeout(tick, 1500); return; }
        pc.getStats().then(rep => {
            if (dead) return;
            let pair = null, nominated = null, succeeded = null;
            const cands = [];
            rep.forEach(r => {
                if (r.type === 'transport' && r.selectedCandidatePairId) pair = rep.get(r.selectedCandidatePairId) || pair;
                else if (r.type === 'candidate-pair' && r.state === 'succeeded') {
                    if (r.nominated || r.selected) nominated = nominated || r;
                    succeeded = succeeded || r;
                } else if (r.type === 'local-candidate' || r.type === 'remote-candidate') cands.push(r);
            });
            pair = pair || nominated || succeeded;
            let kind = null;
            if (pair) {
                kind = _p2pPairKind(rep.get(pair.localCandidateId), rep.get(pair.remoteCandidateId));
            } else if (cands.length) {
                // no usable pair report (older WebKit): fall back to the strongest
                // mechanism present among the candidates we were given
                const kinds = cands.map(_p2pCandKind);
                kind = kinds.every(k => k === 'relay') ? 'relay'
                    : kinds.includes('stun') ? 'stun'
                    : kinds.includes('local') ? 'local' : null;
            }
            if (!kind) { setTimeout(tick, 1500); return; }
            _p2pPath.set(conn.peer, kind);
            _p2pRelaySync();
            setTimeout(tick, 5000);
        }).catch(() => setTimeout(tick, 2000));
    };
    _p2pRelaySync();            // 'checking' — only visible in diagnostic mode
    setTimeout(tick, 700);
}

// Create a resilient HOST peer. Returns the Peer (assign it to your `peer`).
//   fullId              — the room peer id, e.g. PREFIX + code
//   onOpen(id)          — peer registered and ready
//   onConnection(conn)  — a guest/viewer connected (do your per-conn wiring)
//   onFatalError(e)     — a NON-recoverable error (recoverable ones auto-reconnect)
function hostPeer(fullId, opts) {
    const o = opts || {};
    const p = new Peer(fullId, ICE_CFG);
    let tracked = false;   // 'open' can refire after a broker reconnect — count the room once
    p.on('open', id => {
        if (!tracked && typeof trackEvent === 'function') { tracked = true; trackEvent('room_created', { game: typeof gameSlug === 'function' ? gameSlug() : '' }); }
        if (o.onOpen) o.onOpen(id);
    });
    p.on('connection', conn => { p2pWatchRelay(conn); if (o.onConnection) o.onConnection(conn); });
    p.on('disconnected', () => { try { if (p && !p.destroyed) p.reconnect(); } catch (_) {} });
    p.on('error', e => {
        if (isRecoverablePeerError(e)) {
            try { if (p && !p.destroyed && p.disconnected) p.reconnect(); } catch (_) {}
            return;
        }
        if (o.onFatalError) o.onFatalError(e);
    });
    return p;
}

// Guest/viewer JOIN to a room, with retry — and, once in, automatic REJOIN if the
// connection later drops.
//   hostFullId        — room peer id to connect to (PREFIX + code)
//   attempts (3), delayMs (700)      — budget for the FIRST join
//   rejoinAttempts (10)              — budget after a mid-game drop (backs off to 4s)
//   onReady(peer, id, hostConn, fail) — assign your globals + wire
//                       hostConn.on('open'/'data') and send your join msg; pass
//                       `fail` to hostConn.on('error') to funnel into the retry.
//                       Called again on every rejoin — don't wire 'close' yourself.
//   onLost()          — OPT-IN to auto-rejoin: a live connection dropped. Clear your
//                       `connected` flag here; the curtain and retries are automatic.
//   onGiveUp(wasIn)   — out of attempts. `wasIn` is true if we'd been playing (a
//                       mid-game drop we couldn't recover), false for a failed join.
//   isConnected()     — optional; true once connected, so post-connect blips don't
//                       trigger a spurious re-join.
function joinPeer(opts) {
    const o = opts || {};
    const firstAttempts = o.attempts || 3;
    const firstDelay = o.delayMs || 700;
    const rejoinAttempts = o.rejoinAttempts || 10;
    const canRejoin = typeof o.onLost === 'function';

    let attempt = 1;
    let live = false;           // a connection is up right now
    let everLive = false;       // we were in the game at some point
    let stopped = false;        // gave up for good

    const maxAttempts = () => (everLive ? rejoinAttempts : firstAttempts);
    // rejoin backs off 0.6s → 4s so a long outage doesn't hammer the broker
    const waitMs = () => (everLive ? Math.min(600 * attempt, 4000) : firstDelay);

    const giveUp = () => {
        if (stopped) return;
        stopped = true;
        p2pCurtain(false);
        if (o.onGiveUp) o.onGiveUp(everLive);
    };

    const run = () => {
        if (stopped) return;
        let done = false;                       // this attempt is over
        const p = new Peer(undefined, ICE_CFG);

        const fail = () => {
            if (done || stopped || live || (o.isConnected && o.isConnected())) return;
            done = true;
            try { p.destroy(); } catch (_) {}
            if (attempt < maxAttempts()) { attempt++; setTimeout(run, waitMs()); return; }
            giveUp();
        };

        p.on('open', id => {
            const hc = p.connect(o.hostFullId, { reliable: true });
            hc.on('open', () => {
                // fire on the FIRST genuine join only — a mid-game auto-rejoin (everLive
                // already true) is recovering an existing attempt, not a new one
                if (!everLive && typeof trackEvent === 'function') trackEvent('room_joined', { game: typeof gameSlug === 'function' ? gameSlug() : '' });
                live = true; everLive = true; attempt = 1;
                p2pCurtain(false);
                p2pWatchRelay(hc);
            });
            hc.on('close', () => {
                if (stopped || !canRejoin) return;
                if (!live) { fail(); return; }   // never became usable → normal retry
                live = false; done = true;
                o.onLost();                      // game clears its own `connected` flag
                p2pCurtain(true);
                try { p.destroy(); } catch (_) {}
                attempt = 1;
                setTimeout(run, 600);
            });
            if (o.onReady) o.onReady(p, id, hc, fail);
        });
        p.on('error', fail);
        // our own broker socket can drop while the data channel is fine — re-list it
        p.on('disconnected', () => { try { if (p && !p.destroyed && !done) p.reconnect(); } catch (_) {} });
    };
    run();
}
