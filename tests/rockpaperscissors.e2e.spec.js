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
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
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
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
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
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
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
