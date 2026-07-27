// THE CROSS-GAME CONNECTION BATTERY
//
// The same five questions asked of EVERY game, from one table, over real PeerJS rooms.
// Everything else in the connection work is either a shared unit test (does this game use
// the right code?) or a deep dive into one game (does Plump Trek hand your turn back?).
// This is the middle: does each of the nineteen actually behave, end to end?
//
//   1. JOIN        somebody in the room, once
//   2. RESTART     close the browser, come back with the same name → one seat, not two
//   3. SILENCE     stop answering → the host stops counting you
//   4. RETURN      say anything → counted again, same seat
//   5. NO GHOSTS   after all of that, the room holds exactly the players it should
//
// Why silence rather than closing the page: `conn.on('close')` does NOT fire when a browser
// closes (measured: zero close events in 75 seconds), and closing a Playwright context DOES
// fire it — so a test built on closing pages is testing a signal the real world never sends,
// and passes against the bug. Three earlier tests did exactly that.
//
// Run:  npx playwright test tests/connection-battery.e2e.spec.js
// One game:  … --grep "bingo:"

const { test, expect } = require('@playwright/test');
const { GAMES, TV, openRoom, joinFresh, seatNames } = require('./games');

// Nineteen games × several real peers each. The public broker throttles bursts; one retry.
test.describe.configure({ retries: 1 });
test.setTimeout(120_000);

// Stop a phone answering without closing it — what a flat battery looks like to the host.
const goSilent = page => page.evaluate(() => {
    if (typeof stopHeartbeat === 'function') stopHeartbeat();
});
// …and how the host sees it, once its presence window has passed. Games keep players in
// `H.players`; ticktacktoe keeps seats on `App.tour`.
const agePresence = (tv, name) => tv.evaluate(n => {
    // `const App = …` at the top of a script does NOT become window.App, so it has to be
    // reached by bare identifier behind a typeof guard. (This cost a failing test.)
    const rows = (typeof H !== 'undefined' && H && H.players) ||
        (typeof App !== 'undefined' && App.tour && App.tour.seats) || [];
    const row = rows.find(r => r.name === n);
    if (row) row.seen = Date.now() - 60_000;
    return !!row;
}, name);
// who does the host count as present RIGHT NOW?
const presentNames = (tv, spec) => tv.evaluate(fn => {
    if (fn) {                                    // ticktacktoe: seats, own presence notion
        return eval(fn)().filter(Boolean);
    }
    return (typeof connectedPlayers === 'function' ? connectedPlayers() : []).map(p => p.name);
}, spec.g === 'ticktacktoe'
    ? '(() => App.tour.seats.filter(s => s.conn && (!s.seen || Date.now() - s.seen < 13000)).map(s => s.name))'
    : null);


for (const spec of GAMES) {
    test(`${spec.g}: join, restart, go silent, come back — and no ghosts`, async ({ browser }) => {
        const { tv, code } = await openRoom(browser, spec);
        const open = [];
        const join = async name => { const j = await joinFresh(browser, spec, code, name); open.push(j); return j; };

        // ── 1. JOIN ──
        const ava = await join('Ava');
        await expect.poll(() => seatNames(tv, spec), { timeout: 30_000 }).toEqual(['Ava']);

        // a second player, so the room is never down to one and every check has a control
        const ben = await join('Ben');
        await expect.poll(() => seatNames(tv, spec), { timeout: 30_000 })
            .toEqual(expect.arrayContaining(['Ava', 'Ben']));
        expect((await seatNames(tv, spec)).length, `${spec.g}: two players joined, two seats`).toBe(2);

        // ── 2. RESTART: same person, new browser, new device id ──
        await goSilent(ava.page);                // its connection lingers, exactly as in life
        const avaAgain = await join('Ava');
        await expect.poll(() => seatNames(tv, spec).then(n => n.filter(x => x === 'Ava').length),
            { timeout: 30_000, message: `${spec.g}: restarting made a ghost "Ava"` }).toBe(1);
        const after = await seatNames(tv, spec);
        expect(after.length, `${spec.g}: still two seats after a restart — got ${JSON.stringify(after)}`).toBe(2);

        // ── 3. SILENCE: Ben stops answering ──
        await goSilent(ben.page);
        expect(await agePresence(tv, 'Ben'), `${spec.g}: no row for Ben to age`).toBe(true);
        await expect.poll(() => presentNames(tv, spec),
            { timeout: 20_000, message: `${spec.g}: a silent phone is still counted as present` })
            .not.toContain('Ben');
        expect(await seatNames(tv, spec), `${spec.g}: his SEAT is kept — only his presence lapses`)
            .toEqual(expect.arrayContaining(['Ben']));

        // ── 4. RETURN: anything he sends puts him back ──
        await ben.page.evaluate(() => {
            if (typeof startHeartbeat !== 'function') return;
            if (typeof hostConn !== 'undefined' && hostConn) {
                startHeartbeat(() => { try { send(hostConn, { type: 'hb' }); } catch (e) {} });
            } else if (typeof App !== 'undefined' && App.connection) {
                startHeartbeat(() => { try { App.connection.send({ type: 'hb' }); } catch (e) {} });
            }
        });
        await expect.poll(() => presentNames(tv, spec),
            { timeout: 20_000, message: `${spec.g}: he came back but is still counted absent` })
            .toContain('Ben');

        // ── 5. NO GHOSTS ──
        const final = await seatNames(tv, spec);
        expect(final.length, `${spec.g}: ended with ${JSON.stringify(final)}`).toBe(2);
        expect(final.filter(n => n === 'Ava').length).toBe(1);
        expect(final.filter(n => n === 'Ben').length).toBe(1);

        for (const o of open) await o.ctx.close();
        await tv.close();
    });
}

// ⚠️  KNOWN GAP — READ BEFORE TRUSTING THIS BLOCK.
// These cases PASS against the old rule as well as the new one, so they do NOT currently
// prove the fix. The reported bug (a mid-game reconnect minting a second scoreboard row) has
// not been reproduced in a harness. What has been ruled out:
//   • the room really does leave the lobby first (asserted below — an earlier version did not)
//   • the game really does add players mid-game (buzzin's hostAddPlayer has no phase guard)
//   • `git stash push common.js` does NOT revert an already-committed file, which made two
//     earlier "fails on the old code" checks meaningless — use `git show HEAD~1:common.js`
// Only the unit tests currently prove the rule changed. Finish this before believing it.
//
// From a Buzzin' final scoreboard: "Neil (you)" on 1 point, and "Neil (you)" again on 0.
// The duplicate was made MID-GAME — the lobby rule had been relaxed but the mid-game one
// still insisted the old seat go quiet first, and a phone that reconnects is back well inside
// the presence window. So a reconnecting player was handed a brand-new row with a fresh score
// while their real one sat above it.
//
// Asked of every game, because every game can be rejoined mid-play.
for (const spec of GAMES) {
    test(`${spec.g}: reconnecting MID-GAME rejoins your row, it does not add a second one`,
        async ({ browser }) => {
        const { tv, code } = await openRoom(browser, spec);
        const open = [];
        const join = async n => { const j = await joinFresh(browser, spec, code, n); open.push(j); return j; };

        const ava = await join('Ava');
        const neil = await join('Neil');
        await expect.poll(() => seatNames(tv, spec), { timeout: 30_000 })
            .toEqual(expect.arrayContaining(['Ava', 'Neil']));

        // get the room out of the lobby however this game does it, then give Neil something
        // to lose — a duplicate row is only obviously wrong once it has a score of its own
        await tv.evaluate(() => {
            try { if (typeof hostStartGame === 'function') hostStartGame(); } catch (e) {}
            try { if (typeof H !== 'undefined' && H) {
                const n = H.players.find(p => p.name === 'Neil');
                if (n && 'score' in n) n.score = 7;
            } } catch (e) {}
        });

        // The room MUST have left the lobby, or this test silently exercises the lobby rule
        // and passes against the bug — which the first version of it did.
        const phase = await tv.evaluate(() => (typeof H !== 'undefined' && H ? H.phase : null));
        if (phase !== null) {
            expect(phase, `${spec.g}: still in the lobby, so this is not a mid-game reconnect`)
                .not.toBe('lobby');
        }

        // his phone reconnects immediately — no waiting for any presence window
        await ava.page.waitForTimeout(200);
        await neil.page.evaluate(() => { if (typeof stopHeartbeat === 'function') stopHeartbeat(); });
        await join('Neil');

        await expect.poll(() => seatNames(tv, spec).then(n => n.filter(x => x === 'Neil').length),
            { timeout: 30_000, message: `${spec.g}: a mid-game reconnect made a second "Neil"` })
            .toBe(1);
        const names = await seatNames(tv, spec);
        expect(names.length, `${spec.g}: ended with ${JSON.stringify(names)}`).toBe(2);
        // and it is HIS row he came back to, score intact
        const score = await tv.evaluate(() => {
            if (typeof H === 'undefined' || !H) return null;
            const n = H.players.find(p => p.name === 'Neil');
            return n && 'score' in n ? n.score : null;
        });
        if (score !== null) expect(score, `${spec.g}: he came back to a fresh row, not his own`).toBe(7);

        for (const o of open) await o.ctx.close();
        await tv.close();
    });
}
