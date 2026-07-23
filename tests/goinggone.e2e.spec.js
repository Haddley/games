// E2E screenshot tour of Going, Going, GONE! (auction house).
//
// Plays a real auction over PeerJS. Covers:
//   1. TV-first — captain lobby, live bidding war through the network,
//      gavel SOLD, valuation finale, podium, play again
//   2. Phone-first — host phone + TV viewer, single bid wins at the gavel
//
// The lot order is random; tests READ the drawn lots via page.evaluate on the
// host to compute expected net worths (no forcing needed). All bids go through
// the real guest→host network path.
//
// Screenshots land in screenshots/ (gavel-*.png).
//
// Run:  npm run test:e2e        (needs internet: PeerJS broker)

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';

function shot(page, name) {
    return page.screenshot({ path: `${SHOTS}/${name}.png` });
}

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/goinggone.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('TV-first: bidding war, gavel, valuation, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV opens the auction house ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await shot(tv, 'gavel-01-home');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (captain) and Ben take their seats ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ben = await joinPhone(browser, code, 'Ben');
    await expect(ben.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'gavel-02-tv-lobby');
    await shot(karen, 'gavel-03-captain-lobby');

    // Captain trims the sale to 6 lots
    await karen.getByRole('button', { name: '6', exact: true }).click();
    await karen.waitForTimeout(400);

    // ── Start: lot presented, then bidding opens after the 3.5s intro ──
    await karen.getByRole('button', { name: /Start the auction/ }).click();
    await expect(tv.locator('.tv-lot')).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'gavel-04-tv-lot-intro');
    await expect(karen.locator('#bid-btns .btn').first()).toBeEnabled({ timeout: 15_000 });
    const lot1Value = await tv.evaluate(() => LOTS[H.lotOrder[0]].value);

    // ── Bidding war through the real network path ──
    await karen.getByRole('button', { name: '+50', exact: true }).click();
    await expect(karen.locator('text=You\'re winning this lot!')).toBeVisible({ timeout: 10_000 });
    await expect(karen.locator('#bid-btns .btn')).toHaveCount(0);   // can't outbid yourself
    await expect(tv.locator('#v-price')).toHaveText('50', { timeout: 10_000 });
    await expect(ben.locator('text=Karen holds the bid')).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'gavel-05-phone-winning');

    await ben.getByRole('button', { name: '+100', exact: true }).click();
    await expect(tv.locator('#v-price')).toHaveText('150', { timeout: 10_000 });
    await expect(ben.locator('text=You\'re winning this lot!')).toBeVisible({ timeout: 10_000 });

    await karen.getByRole('button', { name: '+10', exact: true }).click();
    await expect(tv.locator('#v-price')).toHaveText('160', { timeout: 10_000 });
    await shot(tv, 'gavel-06-tv-bidding');
    await shot(ben, 'gavel-07-phone-outbid');

    // ── Going… going… GONE! (5s gavel) ──
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 12_000 });
    await expect(tv.locator('.tv-sold .who')).toContainText('Karen');
    await expect(tv.locator('.tv-sold .who')).toContainText('160');
    await expect(karen.locator('text=YOU WON IT!')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'gavel-08-tv-sold');
    await shot(karen, 'gavel-09-phone-won');

    // Skip ahead: pretend that was the last lot (during the SOLD pause)
    await tv.evaluate(() => { H.lotIndex = H.lotOrder.length - 1; });

    // ── The Valuation ──
    await expect(tv.locator('.tv-val')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.val-card').first()).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'gavel-10-tv-valuation');
    await expect(karen.locator('text=The valuer is in')).toBeVisible({ timeout: 10_000 });

    // ── Podium: net worth = coins + shelf ──
    const karenNet = 1000 - 160 + lot1Value;
    const expectedWinner = karenNet >= 1000 ? 'KAREN' : 'BEN';
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 20_000 });
    await tv.waitForTimeout(1500); // pods pop in staggered
    await shot(tv, 'gavel-11-tv-podium');
    await expect(karen.locator('.sold-card .st')).toContainText(`${expectedWinner} WINS!`, { timeout: 10_000 });
    await expect(karen.locator('.standings')).toContainText(String(karenNet));
    await shot(karen, 'gavel-12-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ben].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, single bid takes the lot', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/goinggone.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'gavel-20-host-lobby');

    // ── TV joins as the auction floor ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/goinggone.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open auction floor/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins, Neil opens the sale ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Start the auction/ }).click();
    await expect(jess.locator('#bid-btns .btn').first()).toBeEnabled({ timeout: 15_000 });

    // Jess bids once and lets the gavel fall
    await jess.getByRole('button', { name: '+10', exact: true }).click();
    await expect(jess.locator('text=You\'re winning this lot!')).toBeVisible({ timeout: 10_000 });
    await expect(tv.locator('.tv-sold')).toBeVisible({ timeout: 12_000 });
    await expect(tv.locator('.tv-sold .who')).toContainText('Jess');
    await shot(tv, 'gavel-21-tv-viewer-sold');
    await shot(jess, 'gavel-22-phone-won');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
