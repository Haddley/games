// E2E screenshot tour of Pit! (party do-over).
//
// Plays a real game over PeerJS. Covers:
//   1. TV-first — captain lobby, real matched trade, corner bell, Bear penalty,
//      win → podium, play again
//   2. Phone-first — host phone + TV viewer, one-card trade
//
// Hands are forced via page.evaluate on the host (the deal is random), but all
// offers/trades/corners go through the real guest→host network path.
//
// Screenshots land in screenshots/ (pit-*.png).
//
// Run:  npm run test:e2e        (needs internet: PeerJS broker)

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';
const BELL_WAIT = 3600;   // opening-bell overlay (3-2-1-🔔) blocks taps while visible

function shot(page, name) {
    return page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/pit.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-first: trade, corner bell, bear penalty, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV opens the pit ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/pit.html');
    await shot(tv, 'pit-01-home');
    await tv.getByRole('button', { name: /Open the pit on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (captain) and Ben join ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ben = await joinPhone(browser, code, 'Ben');
    // classic Pit needs 3+ traders — Cass joins but just idles this game
    const cass = await joinPhone(browser, code, 'Cass');
    await expect(ben.locator('.player-row')).toHaveCount(3, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(3, { timeout: 15_000 });
    await shot(tv, 'pit-02-tv-lobby');
    await shot(karen, 'pit-03-captain-lobby');

    // Captain lowers the win score so one good corner run ends the game
    await karen.getByRole('button', { name: '300', exact: true }).click();
    await karen.waitForTimeout(400);

    // Sanity-check the corner detector variants on the host
    const corners = await tv.evaluate(() => [
        bestCorner([...Array(9).fill('Wheat')]),
        bestCorner([...Array(9).fill('Wheat'), 'Bull']),
        bestCorner([...Array(8).fill('Wheat'), 'Bull']),
        bestCorner([...Array(8).fill('Wheat')]),
    ]);
    expect(corners[0]).toMatchObject({ kind: 'standard', pts: 100 });
    expect(corners[1]).toMatchObject({ kind: 'double_bull', pts: 200 });
    expect(corners[2]).toMatchObject({ kind: 'bull', pts: 100 });
    expect(corners[3]).toBeNull();

    // ── Opening bell ──
    await karen.getByRole('button', { name: /Ring the opening bell/ }).click();
    await expect(karen.locator('.hand-grid .pcard')).toHaveCount(9, { timeout: 15_000 });
    await expect(ben.locator('.hand-grid .pcard')).toHaveCount(9, { timeout: 15_000 });
    await karen.waitForTimeout(BELL_WAIT);
    await shot(tv, 'pit-04-tv-floor');
    await shot(karen, 'pit-05-phone-hand');

    // ── Force known hands (sorted: Wheat block then Coffee block), then a real 2-for-2 trade ──
    await tv.evaluate(() => {
        const k = H.players.find(p => p.name === 'Karen');
        const b = H.players.find(p => p.name === 'Ben');
        k.hand = ['Wheat', 'Wheat', 'Wheat', 'Wheat', 'Wheat', 'Coffee', 'Coffee', 'Coffee', 'Coffee'];
        b.hand = ['Wheat', 'Wheat', 'Wheat', 'Wheat', 'Coffee', 'Coffee', 'Coffee', 'Coffee', 'Coffee'];
        broadcastState();
    });
    await karen.waitForTimeout(400);

    // Karen shouts 2 Coffee (indices 5,6 of her sorted hand)
    await karen.locator('.hand-grid .pcard').nth(5).click();
    await karen.locator('.hand-grid .pcard').nth(6).click();
    await shot(karen, 'pit-06-phone-selected');
    await karen.getByRole('button', { name: /SHOUT 2/ }).click();
    await expect(karen.locator('.offer-banner')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.tpill')).toHaveText('2!', { timeout: 10_000 });
    await shot(karen, 'pit-07-phone-shouting');
    await shot(tv, 'pit-08-tv-shout');

    // Ben answers with 2 Wheat → blind swap through the host
    await ben.locator('.hand-grid .pcard').nth(0).click();
    await ben.locator('.hand-grid .pcard').nth(1).click();
    await ben.getByRole('button', { name: /SHOUT 2/ }).click();
    await expect(karen.locator('.offer-banner')).toHaveCount(0, { timeout: 10_000 });
    await expect(tv.locator('#v-trades')).toHaveText('1', { timeout: 10_000 });
    await expect(tv.locator('#v-feed')).toContainText('⇄', { timeout: 10_000 });
    // Karen gave 2 Coffee for 2 Wheat: 7 Wheat + 2 Coffee
    const karenWheat = await karen.locator('.hand-grid .pcard', { hasText: 'Wheat' }).count();
    expect(karenWheat).toBe(7);
    await shot(tv, 'pit-09-tv-after-trade');

    // ── Corner: Karen gets 9 Wheat; Ben is caught holding the Bear ──
    await tv.evaluate(() => {
        const k = H.players.find(p => p.name === 'Karen');
        const b = H.players.find(p => p.name === 'Ben');
        k.hand = Array(9).fill('Wheat');
        b.hand = [...Array(8).fill('Coffee'), 'Bear'];
        broadcastState();
    });
    await expect(karen.locator('.btn-corner')).toBeVisible({ timeout: 10_000 });
    await expect(karen.locator('.btn-corner')).toContainText('CORNER WHEAT! +100');
    await shot(karen, 'pit-10-phone-corner-btn');
    await karen.locator('.btn-corner').click();

    await expect(karen.locator('text=YOU CORNERED IT!')).toBeVisible({ timeout: 10_000 });
    await expect(ben.locator('text=KAREN CORNERS!')).toBeVisible({ timeout: 10_000 });
    await expect(ben.locator('.chip.pen').first()).toContainText('-20');
    await expect(tv.locator('.tv-bell')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.tv-bell .pens')).toContainText('Ben −20');
    await shot(tv, 'pit-11-tv-corner');
    await shot(karen, 'pit-12-phone-corner-win');
    await shot(ben, 'pit-13-phone-corner-penalty');

    // ── Next round, then a winning corner (250 + 100 ≥ 300) ──
    await karen.getByRole('button', { name: /Next round/ }).click();
    await expect(karen.locator('.hand-grid .pcard')).toHaveCount(9, { timeout: 15_000 });
    await karen.waitForTimeout(BELL_WAIT);
    await tv.evaluate(() => {
        const k = H.players.find(p => p.name === 'Karen');
        k.score = 250;
        k.hand = Array(9).fill('Wheat');
        broadcastState();
    });
    await karen.locator('.btn-corner').click();

    await expect(karen.locator('text=YOU WIN!')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 10_000 });
    await tv.waitForTimeout(1500); // pods pop in staggered
    await shot(tv, 'pit-14-tv-podium');
    await shot(karen, 'pit-15-phone-gameover');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ben, cass].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, one-card trade', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/pit.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'pit-20-host-lobby');

    // ── TV joins as the trading floor ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/pit.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open trading floor/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess & Raj join (3-trader minimum), Neil rings the bell ──
    const jess = await joinPhone(browser, code, 'Jess');
    const raj = await joinPhone(browser, code, 'Raj');
    await expect(neil.locator('.player-row')).toHaveCount(3, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Ring the opening bell/ }).click();
    await expect(neil.locator('.hand-grid .pcard')).toHaveCount(9, { timeout: 15_000 });
    await expect(tv.locator('.tv-trader')).toHaveCount(3, { timeout: 15_000 });
    await neil.waitForTimeout(BELL_WAIT);

    // A single-card shout is always a valid bundle — trade 1-for-1
    await neil.locator('.hand-grid .pcard').nth(0).click();
    await neil.getByRole('button', { name: /SHOUT 1/ }).click();
    await jess.locator('.hand-grid .pcard').nth(0).click();
    await jess.getByRole('button', { name: /SHOUT 1/ }).click();
    await expect(tv.locator('#v-trades')).toHaveText('1', { timeout: 10_000 });
    await shot(tv, 'pit-21-tv-viewer-floor');
    await shot(neil, 'pit-22-host-trading');

    await Promise.all([tv, neil, jess, raj].map(p => p.close()));
});
