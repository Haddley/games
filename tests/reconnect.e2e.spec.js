// Connection-resilience E2E: what happens when a phone drops mid-game.
//
//   1. a dropped player auto-rejoins behind the "Reconnecting…" curtain, keeping
//      their score and their place — no re-typing the room code
//   2. a browser REFRESH mid-game walks straight back into the room
//   3. the 👑 crown passes to the next connected player when the captain drops,
//      and comes back when they return (so nobody can freeze the room)
//
// Driven on herdmind (TV-host + captain phone), which is the shape every party
// game shares.
//
// Run:  npx playwright test tests/reconnect.e2e.spec.js

const { test, expect } = require('@playwright/test');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/herdmind.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

// Kill the data connection the way a sleeping phone / wifi blip does.
const dropLink = page => page.evaluate(() => hostConn.close());

test('a dropped phone rejoins itself, keeping its seat', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/herdmind.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const karen = await joinPhone(browser, code, 'Karen');       // captain
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(karen.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });

    await karen.getByRole('button', { name: /Round up the herd/ }).click();
    await expect(ollie.locator('#ans-input')).toBeVisible({ timeout: 15_000 });

    // Ollie's phone drops mid-answer
    await dropLink(ollie);
    await expect(ollie.locator('#p2p-curtain')).toBeVisible({ timeout: 5_000 });

    // …and puts itself back, into the same seat (the host still counts 2 players)
    await expect(ollie.locator('#p2p-curtain')).toHaveCount(0, { timeout: 25_000 });
    await expect(ollie.locator('#ans-input')).toBeVisible({ timeout: 15_000 });
    expect(await tv.evaluate(() => H.players.length)).toBe(2);
    expect(await tv.evaluate(() => H.players.map(p => p.name).join(','))).toBe('Karen,Ollie');

    // and can still play
    await ollie.locator('#ans-input').fill('pizza');
    await ollie.getByRole('button', { name: /Lock it in/ }).click();
    await expect(tv.locator('#v-pen')).toContainText('1 of 2', { timeout: 15_000 });

    for (const p of [tv, karen, ollie]) await p.close();
});

test('a browser refresh walks back into the room', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/herdmind.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const karen = await joinPhone(browser, code, 'Karen');
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(karen.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await karen.getByRole('button', { name: /Round up the herd/ }).click();
    await expect(ollie.locator('#ans-input')).toBeVisible({ timeout: 15_000 });

    await ollie.reload();
    await expect(ollie.locator('#ans-input')).toBeVisible({ timeout: 30_000 });   // back in the round, no re-typing
    expect(await tv.evaluate(() => H.players.length)).toBe(2);

    for (const p of [tv, karen, ollie]) await p.close();
});

test('the 👑 crown passes when the captain drops, and returns when they rejoin', async ({ browser }) => {
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/herdmind.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);

    const karen = await joinPhone(browser, code, 'Karen');       // captain (first in)
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(karen.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await karen.getByRole('button', { name: /Round up the herd/ }).click();
    await expect(karen.locator('#ans-input')).toBeVisible({ timeout: 15_000 });
    expect(await tv.evaluate(() => judgeName())).toBe('Karen');

    // captain's phone dies → Ollie must be able to drive, or the room is stuck
    await dropLink(karen);
    await expect
        .poll(() => tv.evaluate(() => judgeName()), { timeout: 15_000 })
        .toBe('Ollie');

    // …and when Karen's phone comes back it's hers again (same slot, same crown)
    await expect(karen.locator('#p2p-curtain')).toHaveCount(0, { timeout: 25_000 });
    await expect
        .poll(() => tv.evaluate(() => judgeName()), { timeout: 15_000 })
        .toBe('Karen');
    expect(await tv.evaluate(() => H.players.length)).toBe(2);

    for (const p of [tv, karen, ollie]) await p.close();
});
