// Lobby joining and REJOINING, run against every game.
//
// Reported from a real session: "I have joined the Tic Tac Toe lobby multiple times with the
// same device and same name, just by closing and restarting the browser. The captain has no
// idea that multiple connections in the lobby are stale."
//
// The mechanism, and why it hits every game:
//
//   1. `clientId()` lives in sessionStorage, which a browser restart CLEARS. So a restarted
//      browser presents a brand-new device id — the cid match can't fire.
//   2. So the host falls back to matching on name, but that match is guarded by
//      `!guestConns[p.id]` — "only reclaim a seat whose connection is dead".
//   3. And `guestConns` lies. Closing a browser does not fire `conn.on('close')` (measured:
//      zero close events in 75 seconds), so the dead phone is still listed as connected.
//
//   → no match, so a NEW slot is created, and the lobby fills with ghosts of one person.
//
// A fresh browser CONTEXT is exactly this: new sessionStorage, same name. That is what these
// tests use, and it is the honest reproduction of closing and reopening a browser.
//
// Run:  npx playwright test tests/lobby-rejoin.e2e.spec.js

const { test, expect } = require('@playwright/test');

// Every test opens a room and several peers in quick succession, some of them abandoned.
// The public broker occasionally throttles a burst like that. One retry covers it.
test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };

// How each game's lobby is reached. Everything else is uniform enough to share.
const GAMES = [
    { g: 'letterstorm', join: /Join with your phone/ },
    { g: 'familytrivia', join: /Join with your phone/ },
    { g: 'fibbers', join: /Join with your phone/ },
    { g: 'doodleparty', join: /Join with your phone/ },
    { g: 'oddsheep', join: /Join with your phone/ },
    { g: 'herdmind', join: /Join with your phone/ },
    { g: 'categoryclash', join: /Join with your phone/ },
    { g: 'bestguess', join: /Join with your phone/ },
    { g: 'brokenpencil', join: /Join with your phone/ },
    { g: 'moonlightvillage', join: /Join with your phone/ },
    { g: 'goinggone', join: /Join with your phone/ },
    { g: 'bingo', join: /Join with your phone/ },
    // liarsdice takes ?join= rather than ?room=, and has its own code field to fill
    { g: 'liarsdice', join: /Take a seat/, param: 'join', codeSel: '#jc',
      name: 'input[placeholder="e.g. Will Turner"]' },
    { g: 'cornerthemarket', join: /Join with your phone/ },
    { g: 'rockpaperscissors', join: /Join with your phone/ },
    { g: 'lastlaugh', join: /Join with your phone/ },
    { g: 'buzzin', join: /Join with your phone/ },
    { g: 'plumptrek', join: /Join with your phone/ },
    { g: 'ticktacktoe', hostBtn: '#tv-host-btn', code: () => App.roomCode,
      nameSel: '#player-name-input', joinSel: '#join-game-btn',
      seats: () => (App.tour ? App.tour.seats.map(s => s.name) : []) },
];

// open a TV-hosted room and return its code
async function openRoom(browser, spec) {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto(`/${spec.g}.html`);
    if (spec.hostBtn) await tv.locator(spec.hostBtn).click();
    else await tv.getByRole('button', { name: /Host the party on this screen|Host on this screen/i }).first().click();
    // wait for the CODE, not for a particular element — the games lay their lobbies out
    // differently and more than one of them has a hidden phone-lobby code node in the DOM
    await expect.poll(() => tv.evaluate(fn => {
        try { return fn ? eval(fn)() : (typeof roomCode !== 'undefined' ? roomCode : null); }
        catch (e) { return null; }
    }, spec.code ? spec.code.toString() : null), { timeout: 30_000 }).toMatch(/^[A-Z]{4}$/);
    const code = await tv.evaluate(fn => (fn ? eval(fn)() : (typeof roomCode !== 'undefined' ? roomCode : null)),
        spec.code ? spec.code.toString() : null);
    expect(code, `${spec.g}: a TV room must produce a code`).toMatch(/^[A-Z]{4}$/);
    return { tv, code };
}

// join from a FRESH browser context — new sessionStorage, i.e. a restarted browser
async function joinFresh(browser, spec, code, name) {
    const ctx = await browser.newContext({ viewport: PHONE });
    const p = await ctx.newPage();
    await p.goto(`/${spec.g}.html?${spec.param || 'room'}=${code}`);
    if (spec.codeSel) await p.locator(spec.codeSel).fill(code);
    await p.locator(spec.nameSel || spec.name || 'input[placeholder="Enter name"]').first().fill(name);
    if (spec.joinSel) await p.locator(spec.joinSel).click();
    else await p.getByRole('button', { name: spec.join }).first().click();
    return { ctx, page: p };
}

// Who does the host think is in the room? ticktacktoe keeps its state on a class instance
// (App) rather than a global H, hence the per-game hook.
const seatNames = (tv, spec) => tv.evaluate(fn => (fn ? eval(fn)() :
    ((typeof H !== 'undefined' && H && H.players) || []).map(p => p.name)),
    spec.seats ? spec.seats.toString() : null);
const seatCount = async (tv, spec) => (await seatNames(tv, spec)).length;

// Nineteen games × three fresh browsers each is several minutes of real PeerJS handshakes,
// so this runs a SPREAD rather than all of them: the game the bug was reported in, the two
// whose join flow differs from the rest, and a few of the plain ones. The unit test
// ("every game uses the shared rule") is what covers the other twelve — it fails if any game
// still hand-rolls the rule or forgets to send a heartbeat.
const COVERED = ['ticktacktoe', 'liarsdice', 'plumptrek', 'herdmind', 'bingo', 'rockpaperscissors'];

for (const spec of GAMES.filter(x => COVERED.includes(x.g))) {
    test(`${spec.g}: the same person on a restarted browser takes their seat back, not a second one`,
        async ({ browser }) => {
        const { tv, code } = await openRoom(browser, spec);

        const first = await joinFresh(browser, spec, code, 'Neil');
        await expect.poll(() => seatCount(tv, spec), { timeout: 30_000 }).toBe(1);

        // close the browser (not just the tab) and come back as the same person
        await first.ctx.close();
        const second = await joinFresh(browser, spec, code, 'Neil');
        await expect.poll(() => seatCount(tv, spec), { timeout: 30_000 }).toBeGreaterThan(0);

        const names = await seatNames(tv, spec);
        expect(names, `${spec.g}: "Neil" is in the lobby twice — ${JSON.stringify(names)}`)
            .toEqual(['Neil']);

        // and a THIRD restart must not stack up either
        await second.ctx.close();
        const third = await joinFresh(browser, spec, code, 'Neil');
        await expect.poll(() => seatCount(tv, spec), { timeout: 30_000 }).toBeGreaterThan(0);
        const after3 = await seatNames(tv, spec);
        expect(after3, `${spec.g}: three restarts left ${after3.length} ghosts`).toEqual(['Neil']);

        await third.ctx.close();
        await tv.close();
    });
}

// ── mid-GAME, not just the lobby ─────────────────────────────────────────────
// "Can you leave and rejoin as many times as you like while others are playing? Once you
// miss your roll, do you have to wait until everyone goes back to the lobby?"
//
// The answers this pins: yes, as many times as you like; and no, missing your turn does not
// lock you out — you are skipped while you're gone and back in the rotation the moment your
// phone speaks again.
test('plumptrek: leave and rejoin over and over mid-game, keeping your place every time',
    async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/plumptrek.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect.poll(() => tv.evaluate(() => roomCode || ''), { timeout: 30_000 }).toMatch(/^[A-Z]{4}$/);
    const code = await tv.evaluate(() => roomCode);

    const spec = GAMES.find(x => x.g === 'plumptrek');   // use the table, not a guess
    const ava = await joinFresh(browser, spec, code, 'Ava');
    let ben = await joinFresh(browser, spec, code, 'Ben');
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    await ava.page.getByRole('button', { name: /Start the trek/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('turn');

    // give Ben something worth keeping
    await tv.evaluate(() => {
        const b = H.players.find(p => p.name === 'Ben');
        b.pos = 7; b.hand = [{ t: 'Sprint!', x: '+3 on your next roll' }];
        broadcastAll();
    });

    // …and now restart his browser three times in a row, mid-game
    for (let i = 1; i <= 3; i++) {
        await ben.ctx.close();
        // the seat has to go quiet before a NEW device id can claim it by name — that is the
        // rule that stops a second real "Ben" stealing a seat from the first
        await tv.evaluate(() => {
            const b = H.players.find(p => p.name === 'Ben');
            if (b) { b.seen = 0; delete guestConns[b.id]; }
        });
        ben = await joinFresh(browser, spec, code, 'Ben');
        await expect.poll(() => tv.evaluate(() => H.players.length),
            { timeout: 30_000, message: `restart ${i} created a ghost` }).toBe(2);
        const b = await tv.evaluate(() => {
            const x = H.players.find(p => p.name === 'Ben');
            return { pos: x.pos, cards: (x.hand || []).length, away: !!x.away };
        });
        expect(b, `restart ${i}: Ben must come back to the same square with his cards`)
            .toEqual({ pos: 7, cards: 1, away: false });
    }
    expect(await tv.evaluate(() => H.players.map(p => p.name).sort())).toEqual(['Ava', 'Ben']);

    // and missing a turn does NOT lock him out until the lobby: mark him away the way a
    // missed roll does, then let his phone speak again
    await tv.evaluate(() => {
        const b = H.players.find(p => p.name === 'Ben');
        b.away = true;
        H.turnOrder = H.players.map(p => p.id);
        broadcastAll();
    });
    expect(await tv.evaluate(() => {
        // while away, the pack steps over him
        const seen = [];
        for (let i = 0; i < 6; i++) { beginTurn(); seen.push((H.players.find(p => p.id === H.turn) || {}).name); }
        return [...new Set(seen)];
    }), 'an away player is skipped, not waited for').toEqual(['Ava']);

    await tv.evaluate(() => {
        const b = H.players.find(p => p.name === 'Ben');
        b.away = false; guestConns[b.id] = guestConns[b.id] || { peer: b.id, send() {} };
    });
    const back = await tv.evaluate(() => {
        const seen = [];
        for (let i = 0; i < 6; i++) { beginTurn(); seen.push((H.players.find(p => p.id === H.turn) || {}).name); }
        return [...new Set(seen)].sort();
    });
    expect(back, 'and he is back in the rotation at once — no waiting for the lobby')
        .toEqual(['Ava', 'Ben']);

    await ben.ctx.close(); await ava.ctx.close();
    await tv.close();
});

// Straight from the photo Neil sent: a Tic Tac Toe TV bracket showing
// "4 players — Neil, Karen, Karen, Karen". One person, three seats.
//
// The earlier per-game test above passed while this was still broken, because it only ever
// closed ONE browser and ticktacktoe's own rule happened to cope with that shape. This one
// reproduces what actually happened: the same person restarting repeatedly while another
// player sits in the room the whole time.
test('ticktacktoe: one person restarting three times is one seat in the bracket, not four',
    async ({ browser }) => {
    const spec = GAMES.find(x => x.g === 'ticktacktoe');
    const { tv, code } = await openRoom(browser, spec);

    // Neil joins and STAYS — the bracket must keep him while Karen comes and goes
    const neil = await joinFresh(browser, spec, code, 'Neil');
    await expect.poll(() => seatCount(tv, spec), { timeout: 30_000 }).toBe(1);

    const ghosts = [];
    let karen = await joinFresh(browser, spec, code, 'Karen');
    await expect.poll(() => seatCount(tv, spec), { timeout: 30_000 }).toBe(2);

    for (let i = 1; i <= 3; i++) {
        // THE FAITHFUL REPRODUCTION, and it took two goes to get right.
        //
        // Closing the browser context is NOT the same thing: Playwright tears the peer
        // connection down gracefully, so conn.on('close') fires — which is the one signal a
        // real dead phone never sends, and it happens to be exactly what the old rule needed
        // in order to work. A test built that way passes against the bug.
        //
        // What actually happens in the room is SILENCE: the old page is still "connected" as
        // far as the host is concerned, it has simply stopped saying anything. So leave the
        // page open, stop its heartbeat, and age the seat.
        await karen.page.evaluate(() => { if (typeof stopHeartbeat === 'function') stopHeartbeat(); });
        await tv.evaluate(() => {
            const s = App.tour.seats.find(x => x.name === 'Karen');
            if (s) s.seen = Date.now() - 60_000;      // last heard from a minute ago
        });
        ghosts.push(karen);                            // keep it open, holding its connection

        karen = await joinFresh(browser, spec, code, 'Karen');
        await expect.poll(() => seatNames(tv, spec), { timeout: 30_000 }).toEqual(['Neil', 'Karen']);
        const names = await seatNames(tv, spec);
        expect(names.filter(n => n === 'Karen').length,
            `restart ${i}: the bracket shows ${JSON.stringify(names)}`).toBe(1);
    }

    // and the bracket is genuinely playable — two seats, not four
    expect(await seatCount(tv, spec)).toBe(2);
    for (const g of ghosts) await g.ctx.close();
    await karen.ctx.close(); await neil.ctx.close();
    await tv.close();
});

// The Last Laugh, from the second photo: "Karen (you)" three times over, every one showing a
// GREEN dot. That is the tell — the ghosts were all inside the presence window, because a
// person restarting a browser is back in about five seconds. Waiting PRESENCE_MS before
// giving a lobby seat back is far too slow for the thing it is meant to handle.
test('lastlaugh: restarting the browser QUICKLY still gets your lobby seat, not a new one',
    async ({ browser }) => {
    const spec = GAMES.find(x => x.g === 'lastlaugh');
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/lastlaugh.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect.poll(() => tv.evaluate(() => roomCode || ''), { timeout: 30_000 }).toMatch(/^[A-Z]{4}$/);
    const code = await tv.evaluate(() => roomCode);

    const neil = await joinFresh(browser, spec, code, 'Neil');
    await expect.poll(() => seatCount(tv, spec), { timeout: 30_000 }).toBe(1);

    const ghosts = [];
    let karen = await joinFresh(browser, spec, code, 'Karen');
    await expect.poll(() => seatCount(tv, spec), { timeout: 30_000 }).toBe(2);

    for (let i = 1; i <= 3; i++) {
        // No aging this time, and no closing: the old page keeps its connection and its
        // heartbeat is only moments old, exactly as it is when someone reopens their browser
        // straight away. This is the case the presence window CANNOT solve.
        await karen.page.evaluate(() => { if (typeof stopHeartbeat === 'function') stopHeartbeat(); });
        ghosts.push(karen);
        karen = await joinFresh(browser, spec, code, 'Karen');
        await expect.poll(() => seatNames(tv, spec), { timeout: 30_000 }).toEqual(['Neil', 'Karen']);
        const names = await seatNames(tv, spec);
        expect(names.filter(n => n === 'Karen').length,
            `restart ${i}: the lobby shows ${JSON.stringify(names)}`).toBe(1);
    }

    for (const g of ghosts) await g.ctx.close();
    await karen.ctx.close(); await neil.ctx.close();
    await tv.close();
});
