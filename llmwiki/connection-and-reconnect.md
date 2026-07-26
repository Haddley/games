# Connections: how devices find each other, and what happens when they drop

Everything in this repo is peer-to-peer with no backend. Two things follow from
that, and this page is the reference for both:

1. **Getting connected** — WebRTC tries three kinds of path, and which one wins
   decides whether we're spending TURN quota. Every game now shows it on screen.
2. **Staying connected** — phones sleep, wifi blips, browsers get refreshed. The
   host holds the seat; the phone puts itself back.

---

## 1. The ICE ladder — host, STUN, TURN

When two peers connect, each gathers *candidates* (possible addresses) and they
race pairs of them. The winning pair's candidate types name the mechanism:

| Candidate type | What it means | Badge |
|---|---|---|
| `host` | A plain local address. Both devices are on the same wifi/LAN and talk directly. No server involved at all. | 🏠 |
| `srflx` (server-reflexive) | A **STUN** server told the device its public address; the two NATs then hole-punched to each other. Traffic is direct, over the internet. **This is what two phones on different networks normally get.** | 🌐 |
| `prflx` (peer-reflexive) | Same idea, learned during connectivity checks rather than from STUN. Also a direct path. | 🌐 |
| `relay` | No direct path existed (symmetric NAT — mobile carriers, corporate wifi), so a **TURN** server forwards every packet. Works fine, adds latency, spends quota. | 📡 |

Desirability, best to worst: **🏠 → 🌐 → ⏳ (transient) → 📡**. 🏠 wins because no
internet hop is involved at all; 🌐 is direct too, just over the internet, so it costs
one WAN round trip; 📡 doubles the path (device → relay → device) and is the only state
that spends quota.

**If a player is stuck on 📡** it's their NAT, not our code. UPnP or port forwarding on
*their* router can sometimes promote them to 🌐 — but only if their end is the strict
one; on mobile data or carrier-grade NAT there is no local fix and the relay is doing
exactly what we pay it for. Note it takes only *one* strict end to force the relay for
that pair.

The important consequence: **TURN is the fallback, not the normal path.** Two
phones on separate home broadband connections almost always land on 🌐. If you're
testing cross-network play and *don't* see 📡, that's success, not a broken
detector — which is exactly why the badge shows the positive state rather than
appearing only for relays.

Our `ICE_CFG` (in `common.js`) lists Metered's STUN server plus TURN on several
ports/transports, including `:443` and `turns:` TLS so at least one gets through
HTTPS-only networks. See CLAUDE.md → "TURN relay (metered.ca)" for quota and
credential rotation.

### Reading the path in code

`p2p.js` polls `getStats()` on the live `RTCPeerConnection` (ICE can re-nominate
onto a different pair later, so it keeps checking every 5s):

```js
p2pPath()        // 'relay' | 'stun' | 'local' | null
p2pIsRelayed()   // shorthand for the one that matters
```

Finding the selected pair is browser-dependent, so `p2pWatchRelay` tries in order:
`transport.selectedCandidatePairId` → a `nominated`/`selected` succeeded pair →
any succeeded pair → (older WebKit, which reports no usable pair) the raw candidate
list. WebKit has also historically spelled the type `relayed` rather than `relay`;
both are accepted.

A host holds one connection *per player*, so the badge shows the most notable path
across all of them: `relay > stun > local`. If one player on a hostile network is
relayed, the host shows 📡.

### The badge

`common.js` owns the UI: `setNetState('relay'|'stun'|'local'|'checking'|'none')`
mounts a button into the shared control strip. It appears only once you're actually
in a room (`'none'` hides it), and tapping it explains the state in plain English.
`?net=0` on any game URL hides it permanently (sticky per browser); `?net=1` brings
it back.

### Testing the relay path

Two browser pages on one machine always connect 🏠, so the TURN path can't be
exercised by accident. `tests/relay.e2e.spec.js` forces it:

```js
ICE_CFG.config.iceTransportPolicy = 'relay';   // discard every non-relay candidate
```

…and then asserts both ends light 📡. That test talks to the real Metered server,
so it also doubles as a check that the credentials still work.

---

## 2. Staying connected — three layers

A dropped phone used to be dumped back to the home screen with "Disconnected".
Recovery now happens at three levels, and all three are covered by
`tests/reconnect.e2e.spec.js` (and `tests/ticktacktoe.e2e.spec.js` for that game's
bespoke connection code).

### Layer 1 — the host keeps the seat warm

Host state (`H`) never moves. When a player's connection closes, their entry stays
in `H.players`; a later `join` takes the "zombie" slot over rather than creating a
new player, so score, hand and position survive:

```js
const zombie = H.players.find(p => msg.cid && p.cid === msg.cid && p.id !== conn.peer && !guestConns[p.id])
            || H.players.find(p => p.name === name && p.id !== conn.peer && !guestConns[p.id]);
```

**Device id first, name second.** Browsers expose no hardware identifier, so
`common.js` mints one — `clientId()`, stored in **sessionStorage**. That choice is
deliberate: sessionStorage survives a reload and a sleeping phone, but is *per tab*,
so a TV and a phone opened in two tabs of the same device can never be mistaken for
the same player. In private mode (storage blocked) it returns `null` and matching
falls back to the name.

### Layer 2 — the phone re-joins itself

`joinPeer()` owns the whole lifecycle. On a mid-session close it raises the shared
`p2pCurtain` ("Reconnecting… your place in the game is saved") and re-runs the join
up to 10 times, backing off 0.6s → 4s. Games opt in with one line:

```js
onLost: () => { connected = false; },              // → auto-rejoin behind the curtain
onGiveUp: wasIn => { /* wasIn: were we in the game, or did the join never land? */ },
```

Don't wire `hostConn.on('close')` in a game any more — p2p.js does it, and a second
handler would fight the retry loop.

### Layer 3 — a browser refresh

Each tab remembers the room it's in (`rememberRoom` / `savedRoom` / `forgetRoom`,
also sessionStorage), and every game's `boot()` walks straight back in instead of
merely pre-filling the code. Hosting a room calls `forgetRoom()` (a host tab is
nobody's guest) and so does giving up, so a dead room can't loop.

**The host/TV is deliberately never remembered.** `H` *is* the game and it can't
survive a reload — silently re-creating an empty room with the same code would be a
lie. A TV refresh is still the one unrecoverable failure; everything else recovers.

### The 👑 captain must never be a single point of failure

The captain is the first **connected** player (`capPlayer()`), not plain
`H.players[0]`. A captain whose phone sleeps would otherwise freeze the room with
nobody able to press Start/Next. The crown passes to the next connected player, and
comes straight back when the original rejoins (their slot is preserved, so they're
first again). `capSync(prevCapId)` re-syncs only the two phones involved plus the
TV — never a full broadcast, which would interrupt everyone else mid-interaction.

Related trap, worth re-checking on every screen: *whatever the captain is told they
can do, their own phone must actually render the control.* RPS's podium said
"👑 Ollie can start a new game" while showing nobody a button.

### ticktacktoe

Being 2-player and class-based, it holds the seat differently: on a drop the TV (or
phone host) keeps the board and **reserves the role** for `TTT_HOLD_MS` (45s),
tells the other player "reconnecting…", and hands a returning device
`{type:'resume', role, snap}` with the authoritative board. Only when the hold
expires does the game end. The returning device is recognised from
`conn.metadata.cid`, set when the connection is opened.

---

## Symptoms → cause

| What you see | What it usually is |
|---|---|
| "Could not reach room" for a *new* guest, host still shows the lobby | The PeerJS broker dropped the host's socket and de-registered the id. `hostPeer` reconnects on `disconnected` and treats `network`/`server-error`/`socket-*` as recoverable. |
| One remote player can't join at all, others fine | That player's NAT needs TURN. Check their badge: if the room is otherwise 🌐 and they fail entirely, suspect quota exhaustion (dashboard.metered.ca) or a firewall blocking even `turns:443`. |
| Everything laggy for one player | They're on 📡 — every packet is going via the relay. |
| No badge at all | Not in a room yet, or `?net=0` was used on this browser. |
| Player vanished mid-game and came back as a duplicate | Zombie matching failed — cid missing (private mode) *and* the name changed. |

## The id-rekey trap (found the hard way, July 2026)

**A player IS their peer id.** A browser refresh gets them a *new* one, and the host matches
them back to their seat by `cid` (device id) or name and re-points that row:

```js
if (zombie) zombie.id = conn.peer;      // ← not enough
```

That one line is only correct if `H.players` is the *only* place the id lives. In any game
with turn order, a current player, a pending card, a vote map or a finish order, it isn't.
Everything else carries on referring to a peer that no longer exists.

**What it looks like in a real game.** Neil was captain in Plump Trek and it was his turn.
His page reloaded, he rejoined, the crown moved to the other player and back — and his phone
never offered the Roll button again. `me.myTurn` is `H.turn === p.id`, and `H.turn` still
held the dead id. The host was waiting for a roll from nobody, the other player was waiting
for Neil, and the room could not move. Nothing logged an error.

**The fix** is `hostRekeyPlayer(player, newId)`: rewrite every stored reference in one go.
In Plump Trek that is `H.turn`, `H.turnOrder`, `H.order`, `H.finishOrder`, `H.moved.id`,
`H.card.who`, `H.choice.who`, `H.finale.who`, and inside `H.finaleState` the `a`/`b`/`who`/
`last` fields plus the id-keyed `picks`, `votes`, `rolls` and `flips` — including a vote cast
*for* the returning player, which has to follow them too. In The Odd Sheep it is `turnOrder`
and the `votes` map (an orphaned vote means `every(p => H.votes[p.id])` never comes true and
the round never tallies).

**Which games are affected.** Only the ones that store an id somewhere else:

| pattern | example | vulnerable? |
|---|---|---|
| id in turn order / current-player | plumptrek `H.turn`, oddsheep `H.turnOrder` | **yes** — both fixed |
| id as a map key | oddsheep `H.votes` | **yes** — fixed |
| object *reference* to the player | lastlaugh `H.judge = H.players[i]` | no — the reference survives an id change |
| *index* into the players array | liarsdice `H.activePlayers`, `bidderIdx` | no — indices don't change |
| nothing but `H.players` | most of the rest | no |

**The guard.** `unit/plumptrek.test.js` greps the engine for fields that get assigned a
player id and asserts `hostRekeyPlayer` mentions each one. It caught `H.moved` within a
minute of being written — a field I had missed. Add a new id-keyed field and the test fails
until you handle it. `tests/plumptrek.e2e.spec.js` and `tests/oddsheep.e2e.spec.js` both
drive a real refresh mid-round and check the player gets their turn and their vote back.

## `conn.on('close')` does not fire when a tab closes (measured, July 2026)

This was assumed for a long time and it is wrong. A phone whose tab is closed, whose battery
dies, or which is force-quit does **not** trigger `conn.on('close')` on the host. The WebRTC
data channel simply goes quiet; there is no FIN. `guestConns` therefore still lists them, and
every "are they here?" check built on it answers **yes** for a device that is gone.

Measured in Plump Trek, TV host + three phones, one phone closed on its own turn:

```
t+5s … t+65s   turn=Cal  phase=turn  closeEvents=0  liveConns=3
t+70s          turn=Cal  phase=moving                    ← the idle-roll fired
t+75s          turn=Ava  phase=turn
```

Zero close events across 75 seconds. The 12-second "they've gone" fallback armed in
`conn.on('close')` never ran — it only ever fires on a *graceful* disconnect, which is the
rarer case. What actually rescued the room was `IDLE_ROLL_MS` (70s), which rolls on the
absent player's behalf.

**Why that mattered.** `beginTurn` skips absent players with
`if (!guestConns[p.id]) continue`, but `guestConns` still held the dead phone — so the skip
never triggered and the room waited the full 70 seconds **every single lap**. In a four-player
game with one dead phone, that is over a minute of dead air per round.

**The fix** is to stop trusting `guestConns` alone and add a pessimistic flag:

- when the idle-roll timeout actually fires, the host has real evidence — it waited 70s and
  heard nothing — so it sets `p.away = true` as well as rolling for them;
- `beginTurn` skips `p.away`, so the wait is paid **once**, not per lap;
- **any** inbound message from that phone clears the flag and puts them back in the rotation;
- `playersWire` reports `away`, so the rail shows it and nobody wonders why they're skipped.

So the answer to "does the captain ever need to drop a disconnected player?" is **no** — the
room recovers on its own, and no human has to notice or press anything. It just costs one
idle-roll timeout to work it out.

**A heartbeat would be better** and is the obvious next step if this ever needs to be
tighter: phones ping every few seconds, the host marks anyone unheard-from for ~15s as away.
That would cut the one-off 70s to ~15s and would also stop a dead phone holding the 👑 crown
(`capPlayer()` is built on `guestConns` too, so it has the same blind spot). It belongs in
`p2p.js` so every game gets it, which is why it hasn't been done as part of a bug fix.
