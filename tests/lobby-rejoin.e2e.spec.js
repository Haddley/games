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
    { g: 'letterstorm', join: /Join a Party/ },
    { g: 'familytrivia', join: /Join a Game/ },
    { g: 'fibbers', join: /Join a Game/ },
    { g: 'doodleparty', join: /Join a Game/ },
    { g: 'oddsheep', join: /Join a Flock/ },
    { g: 'herdmind', join: /Join a Game/ },
    { g: 'categoryclash', join: /Join a Game/ },
    { g: 'bestguess', join: /Join a Game/ },
    { g: 'brokenpencil', join: /Join a Game/ },
    { g: 'moonlightvillage', join: /Join a Village/ },
    { g: 'goinggone', join: /Join an Auction/ },
    { g: 'bingo', join: /Join a Game/ },
    { g: 'liarsdice', join: /Join a crew/, name: 'input[placeholder="e.g. Bootstrap Bill"]' },
    { g: 'cornerthemarket', join: /Join a Market/ },
    { g: 'ticktacktoe', hostBtn: '#tv-host-btn', code: () => App.roomCode,
      nameSel: '#player-name-input', joinSel: '#join-game-btn',
      seats: () => (App.tour ? App.tour.seats.map(s => s.name) : []) },
    { g: 'rockpaperscissors', join: /Join a Game/ },
    { g: 'lastlaugh', join: /Join a Game/ },
    { g: 'buzzin', join: /Join a Game/ },
    { g: 'plumptrek', join: /Join a Game/ },
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
    await p.goto(`/${spec.g}.html?room=${code}`);
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
