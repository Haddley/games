// E2E for RPS Showdown — the battle-royale one. Everyone throws at once; if exactly two
// symbols appear, everyone on the losing symbol is out. Three identical (or all three
// symbols) is a stalemate and the round replays.
//
// This game had no spec at all, and that is how the podium bug got out: in a TV room
// NOBODY got the "Play again" button, captain included, so the room couldn't start a new
// game. The last test here pins that.
//
// Run:  npx playwright test tests/rockpaperscissors.e2e.spec.js

const { test, expect } = require('@playwright/test');
const fs = require('fs');

// Each test opens a room plus several phones, i.e. a burst of PeerJS registrations on the
// public broker. Back-to-back rooms occasionally get throttled and a join never lands —
// external-service flake, not a game bug. One retry covers it.
test.describe.configure({ retries: 1 });

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';
const shot = (p, n) => p.screenshot({ path: `${SHOTS}/${n}.png` });

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/rockpaperscissors.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}
// everyone throws what they're told; the host resolves once the last one is in
async function throwAll(pages, picks) {
    for (const [name, sym] of Object.entries(picks)) {
        const idx = { rock: 0, paper: 1, scissors: 2 }[sym];
        await pages[name].locator('.throw-btn').nth(idx).click();
        await pages[name].waitForTimeout(120);
    }
}

test('TV showdown: a losing symbol is wiped out, last hand standing wins', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const pageErrors = [];

    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => pageErrors.push('tv: ' + e.message));
    await tv.goto('/rockpaperscissors.html');
    await tv.getByRole('button', { name: /Host the party on this TV/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = {};
    for (const n of ['Ava', 'Ben', 'Cal']) {
        pages[n] = await joinPhone(browser, code, n);
        pages[n].on('pageerror', e => pageErrors.push(n + ': ' + e.message));
    }
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(3);
    await shot(tv, 'rps-01-tv-lobby');

    // the captain (first phone in) is the only one who can start
    await expect(pages.Ava.getByRole('button', { name: /Start showdown/ })).toBeVisible();
    await expect(pages.Ben.getByRole('button', { name: /Start showdown/ })).toHaveCount(0);
    await pages.Ava.getByRole('button', { name: /Start showdown/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('throw');
    await expect(pages.Ava.locator('.throw-btn')).toHaveCount(3, { timeout: 10_000 });
    await shot(pages.Ava, 'rps-02-phone-throw');

    // ── a stalemate first: all three symbols on the table means nobody goes out ──
    await throwAll(pages, { Ava: 'rock', Ben: 'paper', Cal: 'scissors' });
    await expect.poll(() => tv.evaluate(() => H.result && H.result.stalemate), { timeout: 15_000 }).toBe(true);
    expect(await tv.evaluate(() => alivePlayers().length)).toBe(3);
    await shot(tv, 'rps-03-tv-stalemate');

    // ── then a real clash: two symbols, so the losers are eliminated ──
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('throw');
    await throwAll(pages, { Ava: 'rock', Ben: 'scissors', Cal: 'scissors' });
    await expect.poll(() => tv.evaluate(() => alivePlayers().length), { timeout: 20_000 }).toBe(1);
    expect(await tv.evaluate(() => alivePlayers()[0].name)).toBe('Ava', 'rock blunts scissors');
    expect(await tv.evaluate(() => H.players.filter(p => p.out).map(p => p.name).sort()))
        .toEqual(['Ben', 'Cal']);
    await shot(tv, 'rps-04-tv-clash');

    // ── one left standing → the champion screen ──
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('over');
    await expect(tv.locator('.tv-banner, .podium-wrap, .tv-champ').first()).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'rps-05-tv-champion');

    expect(pageErrors, pageErrors.join('\n')).toEqual([]);
    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

// The bug Neil hit: "👑 Ollie can start a new game" on every screen, and a Play again
// button on none of them — including Ollie's.
test('in a TV room the captain actually gets the Play again button', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/rockpaperscissors.html');
    await tv.getByRole('button', { name: /Host the party on this TV/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = { Ava: await joinPhone(browser, code, 'Ava'), Ben: await joinPhone(browser, code, 'Ben') };
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    await pages.Ava.getByRole('button', { name: /Start showdown/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('throw');

    await throwAll(pages, { Ava: 'paper', Ben: 'rock' });          // paper wraps rock
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('over');
    expect(await tv.evaluate(() => (H.players.find(p => p.alive) || {}).name)).toBe('Ava');

    // the captain's phone must show the control the TV says they have
    await expect(pages.Ava.getByRole('button', { name: /Play again/ })).toBeVisible({ timeout: 10_000 });
    await expect(pages.Ben.getByRole('button', { name: /Play again/ })).toHaveCount(0);
    await expect(pages.Ben.locator('.hint')).toContainText('Ava');

    await pages.Ava.getByRole('button', { name: /Play again/ }).click();
    // "Play again" puts the room back in the lobby with everyone revived — the captain
    // then starts the next showdown, same as the first one
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('lobby');
    expect(await tv.evaluate(() => alivePlayers().length)).toBe(2, 'everyone back in');
    await pages.Ava.getByRole('button', { name: /Start showdown/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('throw');

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('phone-first: a host phone runs it without a TV at all', async ({ browser }) => {
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/rockpaperscissors.html');
    await neil.locator('input[placeholder="Enter name"]').first().fill('Neil');
    await neil.getByRole('button', { name: /Host & play on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);

    const jess = await joinPhone(browser, code, 'Jess');
    await expect.poll(() => neil.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    await neil.getByRole('button', { name: /Start showdown/ }).click();
    await expect.poll(() => neil.evaluate(() => H.phase), { timeout: 15_000 }).toBe('throw');

    await throwAll({ Neil: neil, Jess: jess }, { Neil: 'scissors', Jess: 'paper' });
    await expect.poll(() => neil.evaluate(() => (H.players.find(p => p.alive) || {}).name), { timeout: 20_000 })
        .toBe('Neil', 'scissors cut paper');

    for (const p of [neil, jess]) await p.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// DROPPED AND RETURNING PHONES
// ═══════════════════════════════════════════════════════════════════════════════
// RPS is the most stall-prone shape in the repo: the round only resolves early when EVERY
// living player has thrown, so one phone that isn't answering drags every single round out
// to the full timer — and then gets a random throw made for it, so a device nobody is
// holding stays in the game and can win it.
//
// On top of that, a player IS their peer id and a refresh mints a new one. RPS stores ids in
// `H.eliminated`, `H.result.loserIds` and `H.result.throws[].id`, none of which were being
// rewritten when a returning phone took its seat back.

async function rpsRoom(browser, names) {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/rockpaperscissors.html');
    await tv.getByRole('button', { name: /Host the party on this TV/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    const pages = {};
    for (const n of names) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(names.length);
    await pages[names[0]].getByRole('button', { name: /Start showdown/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 15_000 }).toBe('throw');
    return { tv, pages, code };
}

test('a player knocked out who then refreshes is still told they are out, and is named in the standings',
    async ({ browser }) => {
    // FOUR players: one clash has to leave the showdown still running, or Ben lands on the
    // podium instead of the "you're out, spectating" screen this test is about.
    const { tv, pages } = await rpsRoom(browser, ['Ava', 'Ben', 'Cal', 'Dee']);

    // Ben and Cal lose to Ava and Dee
    await throwAll(pages, { Ava: 'rock', Dee: 'rock', Ben: 'scissors', Cal: 'scissors' });
    await expect.poll(() => tv.evaluate(() => alivePlayers().length), { timeout: 20_000 }).toBe(2);
    const benOldId = await tv.evaluate(() => H.players.find(p => p.name === 'Ben').id);
    expect(await tv.evaluate(o => H.eliminated.includes(o), benOldId)).toBe(true);
    await expect(pages.Ben.getByText(/You're out/)).toBeVisible({ timeout: 15_000 });

    // …and Ben's phone reloads
    await pages.Ben.reload({ waitUntil: 'load' });
    await expect.poll(() => tv.evaluate(() =>
        H.players.filter(p => guestConns[p.id]).length), { timeout: 30_000 }).toBe(4);
    const benNewId = await tv.evaluate(() => H.players.find(p => p.name === 'Ben').id);
    expect(benNewId).not.toBe(benOldId);

    // nothing may still be pointing at the peer that went away
    const dangling = await tv.evaluate(o => {
        const bad = [];
        if ((H.eliminated || []).includes(o)) bad.push('H.eliminated');
        if (H.result && (H.result.loserIds || []).includes(o)) bad.push('H.result.loserIds');
        if (H.result && (H.result.throws || []).some(t => t.id === o)) bad.push('H.result.throws');
        return bad;
    }, benOldId);
    expect(dangling, `stale ids: ${dangling.join(', ')}`).toEqual([]);

    // the standings must NAME him — and exactly once. A stale id makes the lookup fail, so
    // he appears as "?" AND again properly further down.
    const names = await tv.evaluate(() => standings().map(s => s.name));
    expect(names, `standings were ${JSON.stringify(names)}`).not.toContain('?');
    expect(names.filter(n => n === 'Ben').length, 'Ben appears once, not twice').toBe(1);
    expect(names.sort()).toEqual(['Ava', 'Ben', 'Cal', 'Dee']);
    // …and being out is a property of the PLAYER, not of the reveal that just scrolled past:
    // his phone must still show the spectator screen once the next round starts
    expect(await tv.evaluate(() => {
        const ben = H.players.find(p => p.name === 'Ben');
        return { alive: ben.alive, out: ben.out };
    }), 'Ben is still out after the refresh').toEqual({ alive: false, out: true });
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('throw');
    await expect(pages.Ben.getByText(/You're out/),
        "Ben's phone must still know he is out").toBeVisible({ timeout: 20_000 });
    await expect(pages.Ben.locator('.throw-btn'), 'and must not be able to throw').toHaveCount(0);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('a phone that leaves for good does not drag every round out to the full timer',
    async ({ browser }) => {
    const { tv, pages } = await rpsRoom(browser, ['Ava', 'Ben', 'Cal']);

    // Cal walks away. The host cannot tell — closing a tab does not fire conn.on('close') —
    // so without a rule for this the round waits the full THROW_SECS every single time.
    await tv.evaluate(() => {
        const cal = H.players.find(p => p.name === 'Cal');
        delete guestConns[cal.id];
        cal.away = true;
    });

    const t0 = Date.now();
    await pages.Ava.locator('.throw-btn').nth(0).click();      // rock
    await pages.Ben.locator('.throw-btn').nth(0).click();      // rock
    // everyone who is actually here has thrown, so the round should resolve NOW
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 6000 }).toBe('reveal');
    const waited = Date.now() - t0;
    expect(waited, `waited ${waited}ms for a player who is not there`).toBeLessThan(5000);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('a phone nobody is holding cannot win the showdown', async ({ browser }) => {
    // The worst outcome: everyone present is eliminated and the trophy goes to a device
    // sitting face-down on a sofa, because hostResolve throws at random on their behalf.
    const { tv, pages } = await rpsRoom(browser, ['Ava', 'Ben', 'Cal']);
    await tv.evaluate(() => {
        const cal = H.players.find(p => p.name === 'Cal');
        delete guestConns[cal.id];
        cal.away = true;
    });
    // Ava and Ben knock each other out around the absent Cal
    await tv.evaluate(() => {
        H.players.filter(p => p.name !== 'Cal').forEach(p => { p.alive = false; p.out = true; H.eliminated.push(p.id); });
        broadcastAll();
    });
    const midGame = await tv.evaluate(() => {
        const c = champion();
        return c ? { name: c.name, away: !!c.away } : null;
    });
    expect(midGame, 'mid-showdown, an absent phone is not the champion — better nobody')
        .toBeNull();

    // …but somebody who WON and then dropped keeps their trophy: they earned it present.
    const kept = await tv.evaluate(() => {
        H.players.forEach(p => { p.alive = false; p.out = false; p.away = false; });
        const ava = H.players.find(p => p.name === 'Ava');
        ava.alive = true;
        H.phase = 'over';
        ava.away = true; delete guestConns[ava.id];     // her phone dies at the podium
        const c = champion();
        return c ? c.name : null;
    });
    expect(kept, 'a fair winner keeps the trophy even if their phone drops').toBe('Ava');
    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('someone opening the room mid-game is told what is going on, not left on a spinner',
    async ({ browser }) => {
    // A guest scans the QR after the showdown has started. Before, hostAddPlayer was gated on
    // the lobby phase, so no slot was made, no message was ever addressed to them, and their
    // phone sat on "Joining the showdown…" forever.
    const { tv, pages, code } = await rpsRoom(browser, ['Ava', 'Ben']);
    const late = await joinPhone(browser, code, 'Dee');

    await expect(late.locator('#app'), 'the latecomer must get a real screen')
        .not.toContainText('Joining the showdown…', { timeout: 20_000 });
    const seen = await late.evaluate(() => ({ ui, hasApp: document.getElementById('app').innerHTML.length }));
    expect(seen.hasApp).toBeGreaterThan(200);
    expect(seen.ui, 'and not be stuck on the connecting spinner').not.toBe('connecting');

    for (const p of [...Object.values(pages), late]) await p.close();
    await tv.close();
});

// ═══════════════════════════════════════════════════════════════════════════════
// KNOCKOUT MODE
// ═══════════════════════════════════════════════════════════════════════════════
// The captain's alternative to the battle royale: two players at a time, everyone else
// watching one screen, a bracket filling in. It runs on the shared bracket.js — the same
// draw ticktacktoe's tournament uses — which is why that logic is a shared file now rather
// than buried in one game.
//
// A match is first to two throws, because a bracket place lost to one unlucky throw would
// feel arbitrary in a way a battle royale does not.
test('knockout: the captain picks it, and a bracket decides the champion', async ({ browser }) => {
    test.setTimeout(120_000);   // six throws, each with a 3.6s reveal
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/rockpaperscissors.html');
    await tv.getByRole('button', { name: /Host the party on this TV/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const pages = {};
    for (const n of ['Ava', 'Ben', 'Cal', 'Dee']) pages[n] = await joinPhone(browser, code, n);
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(4);

    // the captain — and only the captain — gets the choice
    await expect(pages.Ava.getByRole('button', { name: /Knockout/ })).toBeVisible({ timeout: 15_000 });
    await expect(pages.Ben.getByRole('button', { name: /Knockout/ })).toHaveCount(0);
    await pages.Ava.getByRole('button', { name: /Knockout/ }).click();
    await expect.poll(() => tv.evaluate(() => H.mode), { timeout: 15_000 }).toBe('knockout');
    // everyone else is told which game they're about to play
    await expect(pages.Ben.locator('.hint')).toContainText('Knockout', { timeout: 10_000 });

    await pages.Ava.getByRole('button', { name: /Start showdown/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('throw');

    // FOUR players → two semi-finals, then a final. Only two are live at a time.
    expect(await tv.evaluate(() => H.bracket.rounds[0].length), 'two first-round matches').toBe(2);
    expect(await tv.evaluate(() => alivePlayers().length), 'only the two in this match are live').toBe(2);
    expect(await tv.evaluate(() => H.matchRound)).toBe('Semi-final');

    // play the whole tournament from the host, letting the FIRST seat of each match win
    const champ = await tv.evaluate(async () => {
        const sleep = ms => new Promise(r => setTimeout(r, ms));
        for (let guard = 0; guard < 200 && H.phase !== 'over'; guard++) {
            if (H.phase === 'throw') {
                const live = alivePlayers();
                if (live.length === 2) {
                    // first seat throws rock, second throws scissors → first wins the throw
                    hostChoose(live[0], 'rock');
                    hostChoose(live[1], 'scissors');
                }
            }
            await sleep(300);
        }
        const c = H.players.find(p => p.alive);
        return { name: c && c.name, phase: H.phase, eliminated: H.eliminated.length,
                 standings: standings().map(s => s.name) };
    });

    expect(champ.phase, 'the tournament finished').toBe('over');
    expect(champ.name, 'somebody won it').toBeTruthy();
    expect(champ.eliminated, 'four players, three knocked out').toBe(3);
    expect(champ.standings.length, 'and everyone is on the final board').toBe(4);
    expect(champ.standings[0], 'the champion tops it').toBe(champ.name);
    expect(new Set(champ.standings).size, 'nobody appears twice').toBe(4);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});

test('knockout: one unlucky throw does not end your tournament', async ({ browser }) => {
    // A match is first to TWO. Losing a bracket place to a single throw would be arbitrary.
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/rockpaperscissors.html');
    await tv.getByRole('button', { name: /Host the party on this TV/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    const pages = { Ava: await joinPhone(browser, code, 'Ava'), Ben: await joinPhone(browser, code, 'Ben') };
    await expect.poll(() => tv.evaluate(() => H.players.length), { timeout: 30_000 }).toBe(2);
    await pages.Ava.getByRole('button', { name: /Knockout/ }).click();
    await pages.Ava.getByRole('button', { name: /Start showdown/ }).click();
    await expect.poll(() => tv.evaluate(() => H.phase), { timeout: 20_000 }).toBe('throw');

    // Ava wins the first throw — and Ben is still in it
    const afterOne = await tv.evaluate(async () => {
        const live = alivePlayers();
        hostChoose(live.find(p => p.name === 'Ava'), 'rock');
        hostChoose(live.find(p => p.name === 'Ben'), 'scissors');
        await new Promise(r => setTimeout(r, 4200));   // a reveal lasts REVEAL_MS (3.6s)
        return { phase: H.phase, out: H.players.filter(p => p.out).map(p => p.name),
                 wins: H.players.map(p => [p.name, p.wins || 0]) };
    });
    expect(afterOne.out, 'losing one throw must not knock you out').toEqual([]);
    expect(afterOne.phase, 'the match continues').not.toBe('over');
    expect(afterOne.wins.find(w => w[0] === 'Ava')[1], 'Ava is one up').toBe(1);

    for (const p of Object.values(pages)) await p.close();
    await tv.close();
});
