// E2E screenshot tour of Category Clash.
//
// Plays a real game over PeerJS. Covers:
//   1. TV-first — captain lobby, typed answers through the real network path,
//      CLASH duplicates, alliteration bonus, wrong-letter rejection, captain
//      veto toggle, DONE early-finish, 2 rounds → podium + awards, play again
//   2. Phone-first — host phone + TV viewer, race renders on the viewer,
//      judging drives from the host phone
//
// Determinism: the letter pool is pinned via page.evaluate on the host BEFORE
// the game starts (LETTERS is mutated in place), so round 1 is always "B".
//
// Screenshots land in screenshots/ (catclash-*.png).
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
    await p.goto('/categoryclash.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

const NEXT_RE = /Next category|Next round|To the podium/;

test('TV-first: race, clash, alliteration, veto, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/categoryclash.html');
    await shot(tv, 'catclash-01-home');
    await tv.getByRole('button', { name: /Create the game on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // Pin the letter pool: round 1 = B, round 2 = C
    // Pin the pool AND make shuffle() an identity (Fisher-Yates with j===i),
    // so round 1 is deterministically "B" and round 2 "C".
    await tv.evaluate(() => { LETTERS.length = 0; LETTERS.push('B', 'C'); Math.random = () => 0.999999; });

    // ── Karen (captain) and Ollie join ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(ollie.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(2, { timeout: 15_000 });
    await shot(tv, 'catclash-02-tv-lobby');
    await shot(karen, 'catclash-03-captain-lobby');

    // Captain: 2 rounds
    await karen.getByRole('button', { name: '2', exact: true }).click();
    await karen.waitForTimeout(400);

    // ── RACE round 1 (letter B) ──
    await karen.getByRole('button', { name: /Start the game/ }).click();
    await expect(tv.locator('.tv-letter')).toHaveText('B', { timeout: 15_000 });
    await expect(karen.locator('#ans-0')).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'catclash-04-tv-race');

    // Karen: a clash, an alliteration bonus, a unique
    await karen.locator('#ans-0').fill('Bear');
    await karen.locator('#ans-1').fill('Big Bear');
    await karen.locator('#ans-2').fill('Banana');
    // Ollie: the same clash + a wrong-letter answer
    await ollie.locator('#ans-0').fill('Bear');
    await ollie.locator('#ans-1').fill('Cat');
    await karen.waitForTimeout(800);   // debounced autosave flush
    await expect(tv.locator('#v-prog')).toContainText('3/8', { timeout: 10_000 });
    await shot(karen, 'catclash-05-phone-race');

    await karen.getByRole('button', { name: /DONE/ }).click();
    await ollie.getByRole('button', { name: /DONE/ }).click();

    // ── JUDGE cat 1: Bear vs Bear → CLASH, both 0 ──
    await expect(tv.locator('.tv-judge-head')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.tv-entry.zap')).toHaveCount(2, { timeout: 10_000 });
    await expect(tv.locator('.tv-entry').first()).toContainText('CLASH');
    await shot(tv, 'catclash-06-tv-judge-clash');
    await shot(karen, 'catclash-07-phone-judge-captain');

    // ── cat 2: Big Bear ✨+15, Cat rejected; test the veto toggle ──
    await karen.getByRole('button', { name: NEXT_RE }).click();
    await expect(tv.locator('.tv-entry', { hasText: 'Big Bear' })).toContainText('✨ +15', { timeout: 10_000 });
    await expect(tv.locator('.tv-entry', { hasText: 'Cat' })).toContainText('✗ not “B”');
    await shot(tv, 'catclash-08-tv-judge-allit');
    await karen.locator('.vbtn').first().click();   // veto Karen's Big Bear
    await expect(tv.locator('.tv-entry', { hasText: 'Big Bear' })).toContainText('👎 vetoed', { timeout: 10_000 });
    await shot(tv, 'catclash-09-tv-judge-veto');
    await karen.locator('.vbtn').first().click();   // un-veto
    await expect(tv.locator('.tv-entry', { hasText: 'Big Bear' })).toContainText('✨ +15', { timeout: 10_000 });

    // ── cat 3: Banana unique +10, then tap through the empty categories ──
    await karen.getByRole('button', { name: NEXT_RE }).click();
    await expect(tv.locator('.tv-entry', { hasText: 'Banana' })).toContainText('✓ +10', { timeout: 10_000 });
    for (let i = 0; i < 6; i++) {
        await karen.getByRole('button', { name: NEXT_RE }).click();
        await karen.waitForTimeout(250);
    }

    // ── Round 2 (letter C): skip the race, judge is all empty ──
    await expect(tv.locator('.tv-letter')).toHaveText('C', { timeout: 15_000 });
    await tv.evaluate(() => endRace());
    await expect(karen.getByRole('button', { name: NEXT_RE })).toBeVisible({ timeout: 15_000 });
    for (let i = 0; i < 8; i++) {
        await karen.getByRole('button', { name: NEXT_RE }).click();
        await karen.waitForTimeout(250);
    }

    // ── Podium: Karen 25 (15 + 10), Wordsmith award ──
    await expect(karen.locator('text=Karen WINS!')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('.chip', { hasText: 'Wordsmith' })).toContainText('Karen');
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.pod.p1')).toContainText('25 pts');
    await tv.waitForTimeout(1500); // pods pop in staggered
    await shot(tv, 'catclash-10-tv-podium');
    await shot(karen, 'catclash-11-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ollie].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, judging from the host phone', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/categoryclash.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'catclash-20-host-lobby');

    // ── TV joins as viewer ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/categoryclash.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open TV screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess joins, Neil starts ──
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });
    await neil.getByRole('button', { name: /Start the game/ }).click();
    await expect(tv.locator('.tv-letter')).toBeVisible({ timeout: 15_000 });
    const letter = await neil.evaluate(() => H.cur.letter);

    // Neil answers with a guaranteed-valid word, both finish early
    await neil.locator('#ans-0').fill(letter + 'ish');
    await neil.getByRole('button', { name: /DONE/ }).click();
    await jess.getByRole('button', { name: /DONE/ }).click();

    // Judging renders on the viewer; the host phone drives it
    await expect(tv.locator('.tv-judge-head')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.tv-entry', { hasText: letter + 'ish' })).toContainText('✓ +10');
    await expect(neil.getByRole('button', { name: NEXT_RE })).toBeVisible();
    await shot(tv, 'catclash-21-tv-viewer-judge');
    await shot(neil, 'catclash-22-host-judge');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
