// E2E screenshot tour of Herd Mind.
//
// Plays real games over PeerJS:
//   1. TV-first — 👑 shepherd (captain) lobby, secret answers, auto-grouping
//      ("Pizza"/"pizza " cluster), lone answer takes the 🐄, judge MERGES
//      near-matches ("kitty" into "cat"), fast-forward to the podium
//   2. Phone-first — host phone is the judge, TV viewer, two-player herd
//
// Screenshots land in screenshots/ (herd-*.png).
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
    await p.goto('/herdmind.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

async function answer(page, text) {
    await page.locator('#ans-input').fill(text);
    await page.getByRole('button', { name: /Lock it in/ }).click();
    // locked view for early answerers; the last answerer jumps straight to grouping
    await expect(page.locator('#ans-input')).toHaveCount(0, { timeout: 10_000 });
}

test('TV-first: herds, pink cow, shepherd merge, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/herdmind.html');
    await shot(tv, 'herd-01-home');
    await tv.getByRole('button', { name: /Create the game on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (shepherd), Ollie, Ben ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Shepherd\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ollie = await joinPhone(browser, code, 'Ollie');
    const ben = await joinPhone(browser, code, 'Ben');
    await expect(karen.locator('.player-row')).toHaveCount(3, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(3, { timeout: 15_000 });
    await shot(tv, 'herd-02-tv-lobby');
    await shot(karen, 'herd-03-shepherd-lobby');

    // Shepherd sets the target to 5
    await karen.getByRole('button', { name: '5', exact: true }).click();
    await karen.waitForTimeout(400);

    // ── Round 1: Pizza herd vs lone Broccoli ──
    await karen.getByRole('button', { name: /Round up the herd/ }).click();
    await expect(karen.locator('#ans-input')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('#v-pen')).toContainText('0 of 3', { timeout: 15_000 });
    await shot(tv, 'herd-04-tv-answer');
    await shot(karen, 'herd-05-phone-answer');

    await answer(karen, 'Pizza');
    await expect(tv.locator('#v-pen')).toContainText('1 of 3', { timeout: 10_000 });
    await answer(ollie, 'pizza ');            // same herd after normalization
    await answer(ben, 'Broccoli');            // lone → the cow

    // ── Grouping: shepherd sees two herds ──
    await expect(karen.locator('.herd-chip')).toHaveCount(2, { timeout: 15_000 });
    await expect(ollie.locator('text=sorting the herds')).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'herd-06-shepherd-grouping');
    await karen.getByRole('button', { name: /These herds look right/ }).click();

    // ── Reveal: pizza herd scores, Ben takes the cow ──
    await expect(karen.locator('text=You ran with the herd!')).toBeVisible({ timeout: 15_000 });
    await expect(ben.locator('text=MOO! You got the cow!')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.cow-banner')).toContainText('Ben', { timeout: 15_000 });
    await expect(tv.locator('.herd-row.win')).toHaveCount(1);
    await tv.waitForTimeout(1200); // herd rows pop in staggered
    await shot(tv, 'herd-07-tv-reveal-cow');
    await shot(karen, 'herd-08-phone-herd-verdict');
    await shot(ben, 'herd-09-phone-cow-verdict');

    // ── Round 2: the merge showpiece — "cat" + "kitty" + "cat" ──
    await karen.getByRole('button', { name: /Next prompt/ }).click();
    await expect(karen.locator('#ans-input')).toBeVisible({ timeout: 15_000 });
    await answer(karen, 'cat');
    await answer(ollie, 'kitty');
    await answer(ben, 'cat');
    await expect(karen.locator('.herd-chip')).toHaveCount(2, { timeout: 15_000 });
    // tap "kitty", then tap "cat" → one herd of 3
    await karen.locator('.herd-chip', { hasText: 'kitty' }).click();
    await karen.locator('.herd-chip', { hasText: 'cat' }).first().click();
    await expect(karen.locator('.herd-chip')).toHaveCount(1, { timeout: 10_000 });
    await expect(karen.locator('.herd-chip .hc-count')).toHaveText('3');
    await shot(karen, 'herd-10-shepherd-merged');
    await karen.getByRole('button', { name: /These herds look right/ }).click();

    // everyone scored; Ben keeps the cow (no singleton this round)
    await expect(ben.locator('text=You ran with the herd!')).toBeVisible({ timeout: 15_000 });
    await expect(ben.locator('.standings')).toContainText('🐄');

    // ── Fast-forward: Karen to 4 points, then a unanimous round wins it ──
    await tv.evaluate(() => { H.players.find(p => p.name === 'Karen').score = 4; });
    await karen.getByRole('button', { name: /Next prompt/ }).click();
    await expect(karen.locator('#ans-input')).toBeVisible({ timeout: 15_000 });
    await answer(karen, 'dog');
    await answer(ollie, 'dog');
    await answer(ben, 'dog');
    await expect(karen.locator('.herd-chip')).toHaveCount(1, { timeout: 15_000 });
    await karen.getByRole('button', { name: /These herds look right/ }).click();
    await expect(karen.getByRole('button', { name: /See the podium/ })).toBeVisible({ timeout: 15_000 });
    await karen.getByRole('button', { name: /See the podium/ }).click();

    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=Karen wins!')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1500); // pods pop in staggered
    await shot(tv, 'herd-11-tv-podium');
    await shot(karen, 'herd-12-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Shepherd\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ollie, ben].map(p => p.close()));
});

test('phone-first: host phone judges, TV viewer, two-player herd', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/herdmind.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'herd-20-host-lobby');

    // ── TV joins as a viewer ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/herdmind.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open TV screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins; Neil starts ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Round up the herd/ }).click();
    await expect(neil.locator('#ans-input')).toBeVisible({ timeout: 15_000 });

    // Both say chips → one herd of two, +1 each, no cow
    await answer(neil, 'chips');
    await answer(jess, 'Chips');
    await expect(neil.locator('.herd-chip')).toHaveCount(1, { timeout: 15_000 });
    await shot(neil, 'herd-21-host-judging');
    await neil.getByRole('button', { name: /These herds look right/ }).click();

    await expect(neil.locator('text=You ran with the herd!')).toBeVisible({ timeout: 15_000 });
    await expect(jess.locator('text=You ran with the herd!')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.herd-row.win')).toHaveCount(1, { timeout: 15_000 });
    await shot(tv, 'herd-22-tv-viewer-reveal');
    await shot(neil, 'herd-23-host-reveal');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
