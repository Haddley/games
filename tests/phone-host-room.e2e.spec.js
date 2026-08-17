// THE PHONE-HOSTED ROOM, with a TV that joins afterwards.
//
// Almost every other spec opens the room on the TV. This is the other topology, and it is the
// one a family actually falls into when there's no TV to hand: somebody taps "Host on this
// phone", everyone else types the code, and a screen is fetched *later* and asked to watch a
// room that already exists.
//
// Three things it exercises that TV-hosted specs never do:
//
//   1. the HOST IS A PLAYER. In a TV room the host holds no cards and there is a captain;
//      here the host holds the game AND plays it, and there is no captain at all. The RPS
//      lobby bug earlier this session was exactly this — the phone host was sent to the guest
//      lobby, which has a captain-only Start button, so nobody could start.
//   2. joining by TYPING A CODE rather than following a QR link, so `?room=` never fills the
//      field in.
//   3. a VIEWER attaching to a room mid-life, which has to be sent a snapshot of whatever is
//      already happening rather than a lobby.
//
// Run:  npx playwright test tests/phone-host-room.e2e.spec.js

const { test, expect } = require('@playwright/test');
const { GAMES, PHONE, TV, minSeats, hostStart } = require('./games');

// Each test opens a phone host, two guests and a TV — four peers in a few seconds. The public
// broker throttles bursts like that; one retry covers it.
test.describe.configure({ retries: 1 });
test.setTimeout(90_000);

const nameSel = spec => spec.nameSel || spec.name || 'input[placeholder="Enter name"]';

// somebody taps "Host on this phone" and reads the code off their own screen
async function hostOnPhone(browser, spec, who) {
    const ctx = await browser.newContext({ viewport: PHONE });
    const page = await ctx.newPage();
    await page.goto(`/${spec.g}.html`);
    await page.locator(nameSel(spec)).first().fill(who);
    await page.getByRole('button', { name: spec.hostPhone }).first().click();
    await expect.poll(() => page.evaluate(() => (typeof roomCode === 'string' ? roomCode : '')),
        { timeout: 30_000, message: `${spec.g}: hosting on a phone must produce a room code` })
        .toMatch(/^[A-Z]{4}$/);
    return { ctx, page, code: await page.evaluate(() => roomCode) };
}

// …and everyone else TYPES it, rather than following a QR link
async function joinByCode(browser, spec, code, who) {
    const ctx = await browser.newContext({ viewport: PHONE });
    const page = await ctx.newPage();
    await page.goto(`/${spec.g}.html`);
    await page.locator(nameSel(spec)).first().fill(who);
    // The TV card's own "existing room" code field sits first on the home screen now, so the
    // JOIN card's field — the one this function actually wants — is the second one, not the
    // first. Exactly two such fields exist on every game's home screen (TV's and Join's).
    const codeBox = spec.codeSel ? page.locator(spec.codeSel)
        : page.locator('input[placeholder="4-letter code"]').nth(1);
    await codeBox.fill(code);
    await page.getByRole('button', { name: spec.join }).first().click();
    return { ctx, page };
}

// a screen is fetched afterwards and asked to watch a room that already exists
async function tvWatches(browser, spec, code) {
    const ctx = await browser.newContext({ viewport: TV });
    const page = await ctx.newPage();
    await page.goto(`/${spec.g}.html`);
    // The viewer code box lives in the "TV / Big Screen" card on every game's home screen.
    // liarsdice labels its differently, hence the per-game hook.
    const box = spec.tvCodeSel
        ? page.locator(spec.tvCodeSel)
        : page.locator('.card', { hasText: 'TV / Big Screen' }).locator('input[placeholder="4-letter code"]');
    await box.fill(code);
    await page.getByRole('button', { name: spec.openTv }).first().click();
    return { ctx, page };
}

const hostPlayers = page => page.evaluate(() =>
    (typeof H !== 'undefined' && H && H.players ? H.players.map(p => p.name) : []));

for (const spec of GAMES.filter(g => !g.noTvJoin)) {
    test(`${spec.g}: phone hosts, two join by code, a TV watches`, async ({ browser }) => {
        const open = [];
        const host = await hostOnPhone(browser, spec, 'Neil');
        open.push(host);

        // the host is IN the room, not merely running it
        await expect.poll(() => hostPlayers(host.page), { timeout: 20_000 }).toEqual(['Neil']);

        for (const who of ['Ava', 'Ben']) open.push(await joinByCode(browser, spec, host.code, who));
        await expect.poll(() => hostPlayers(host.page),
            { timeout: 30_000, message: `${spec.g}: typing the code must get you in` })
            .toEqual(['Neil', 'Ava', 'Ben']);

        // …and the host's own screen shows the room, rather than sitting on a spinner or a
        // guest lobby it cannot drive
        const hostUi = await host.page.evaluate(() => (typeof ui === 'string' ? ui : ''));
        expect(hostUi, `${spec.g}: the phone host must land somewhere real`).not.toBe('connecting');
        expect(hostUi, `${spec.g}: …and not on the home screen`).not.toBe('home');
        expect(await host.page.locator('#app').innerHTML().then(h => h.length),
            `${spec.g}: the host has a screen`).toBeGreaterThan(200);

        // a TV turns up afterwards and asks to watch a room that already exists
        const tv = await tvWatches(browser, spec, host.code);
        open.push(tv);
        await expect.poll(() => tv.page.evaluate(() => {
            const el = document.getElementById('app');
            return el ? el.innerHTML.length : 0;
        }), { timeout: 30_000, message: `${spec.g}: the TV must be shown the room it asked for` })
            .toBeGreaterThan(200);
        expect(await tv.page.evaluate(() => (typeof ui === 'string' ? ui : '')),
            `${spec.g}: the TV must not be stuck connecting`).not.toBe('connecting');
        // …and it is watching THIS room. A viewer is not hosting, so it has no `roomCode`; and
        // the games lay their big screens out too differently to assert on rendered text (some
        // show names, some show chips). What they all have is the SNAPSHOT the host sent, so
        // assert that it names this room's three players.
        const got = await tv.page.evaluate(() => {
            const d = (typeof vD !== 'undefined' && vD) || (typeof D !== 'undefined' && D) || null;
            if (!d) return null;
            const ps = d.players || d.standings || [];
            return ps.map(p => (typeof p === 'string' ? p : p.name)).filter(Boolean);
        });
        // Not every game exposes its viewer state as `vD.players` — bingo's flashboard keeps
        // a different shape — so where the roster is not reachable this asserts the weaker
        // thing (the TV rendered a real screen, checked above) and says so rather than
        // silently passing. Strengthen it per game as each viewer state is confirmed.
        if (got && got.length) {
            expect(got.slice().sort(), `${spec.g}: the TV attached to a different room — it sees ${JSON.stringify(got)}`)
                .toEqual(['Ava', 'Ben', 'Neil']);
        } else {
            test.info().annotations.push({ type: 'partial',
                description: `${spec.g}: viewer roster not exposed as vD.players — only the render was checked` });
        }
        // the host still holds the game — a viewer must never take it over
        expect(await hostPlayers(host.page), `${spec.g}: the viewer changed the roster`)
            .toEqual(['Neil', 'Ava', 'Ben']);

        for (const o of open) await o.ctx.close();
    });
}

// Every case above attaches the TV while the room is still in the LOBBY — before anyone has
// even joined. The scenario that never gets exercised: people are already PLAYING (phone
// host-and-play, mid-game), and only THEN does someone bring a TV in, purely as a scoreboard,
// to a room it did not create. This is that.
for (const spec of GAMES.filter(g => !g.noTvJoin)) {
    test(`${spec.g}: a TV attaches to a room that is already mid-gameplay, not just the lobby`, async ({ browser }) => {
        const open = [];
        const host = await hostOnPhone(browser, spec, 'Neil');
        open.push(host);

        const need = Math.max(2, await minSeats(host.page));
        const extras = ['Ava', 'Ben', 'Cam', 'Dee', 'Eli'].slice(0, need - 1);
        for (const who of extras) open.push(await joinByCode(browser, spec, host.code, who));
        const seated = ['Neil', ...extras];
        await expect.poll(() => hostPlayers(host.page), { timeout: 30_000 }).toEqual(seated);

        // leave the lobby however this game spells it (hostStartGame/hostStartRound/…)
        const started = await hostStart(host.page);
        if (started.phase !== null) {
            expect(started.phase,
                `${spec.g}: still in the lobby with ${need} players — tried ${started.tried.join(', ') || 'nothing'}`)
                .not.toBe('lobby');
        }

        // ONLY NOW does a TV turn up, asking to watch a room that is already under way
        const tv = await tvWatches(browser, spec, host.code);
        open.push(tv);
        await expect.poll(() => tv.page.evaluate(() => {
            const el = document.getElementById('app');
            return el ? el.innerHTML.length : 0;
        }), { timeout: 30_000, message: `${spec.g}: the TV must be shown the room it asked for` })
            .toBeGreaterThan(200);
        expect(await tv.page.evaluate(() => (typeof ui === 'string' ? ui : '')),
            `${spec.g}: the TV must not be stuck connecting`).not.toBe('connecting');

        // the point of this test: the snapshot the TV was handed reflects the game IN
        // PROGRESS, not a lobby it never saw form
        const phase = await tv.page.evaluate(() => {
            const d = (typeof vD !== 'undefined' && vD) || (typeof D !== 'undefined' && D) || null;
            return d ? (d.phase || d.ui || null) : null;
        });
        if (phase !== null) {
            expect(phase, `${spec.g}: the TV attached mid-game but was shown phase/ui "${phase}"`)
                .not.toBe('lobby');
        } else {
            test.info().annotations.push({ type: 'partial',
                description: `${spec.g}: no phase/ui field on the viewer snapshot to assert on — only the render was checked` });
        }
        // and the room itself is unaffected — the host still holds exactly who it started with
        expect(await hostPlayers(host.page), `${spec.g}: the TV joining changed the roster`).toEqual(seated);

        for (const o of open) await o.ctx.close();
    });
}
