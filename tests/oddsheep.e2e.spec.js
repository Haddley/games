// E2E screenshot tour of The Odd Sheep.
//
// Plays a real round over PeerJS. The category, secret word, sheep and turn
// order are rigged via page.evaluate on the HOST page only (the deal is
// random); every clue/vote/guess goes through the real guest→host path.
//
//   1. TV-first — captain lobby, rigged deal, clue rejection, clue wall,
//      vote → sheep caught → wrong guess → busted reveal, podium, play again
//   2. Phone-first — host phone + TV viewer, first clue lands on the wall
//
// Screenshots land in screenshots/ (sheep-*.png).
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
    await p.goto('/oddsheep.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

// rig the current round on the host page: category, secret word, sheep, turn order
function rig(hostPage, catIdx, secretIdx, sheepName, turnNames) {
    return hostPage.evaluate(([ci, si, sheep, turns]) => {
        H.category = CATEGORIES[ci];
        H.secretIdx = si;
        H.sheepId = H.players.find(p => p.name === sheep).id;
        H.turnOrder = turns.map(n => H.players.find(p => p.name === n).id);
        H.turnIdx = 0;
        dealBroadcast();
    }, [catIdx, secretIdx, sheepName, turnNames]);
}

test('TV-first: rigged round — clues, vote, caught sheep busted, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/oddsheep.html');
    await shot(tv, 'sheep-01-home');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (captain), Ben, Ollie join ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ben = await joinPhone(browser, code, 'Ben');
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(ollie.locator('.player-row')).toHaveCount(3, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(3, { timeout: 15_000 });
    await shot(tv, 'sheep-02-tv-lobby');
    await shot(karen, 'sheep-03-captain-lobby');

    // ── Start, then rig: Breakfast board, secret = Toast, sheep = Ollie ──
    await karen.getByRole('button', { name: /Start the game/ }).click();
    await expect(tv.locator('.tv-wgrid')).toBeVisible({ timeout: 15_000 });
    await rig(tv, 0, 0, 'Ollie', ['Karen', 'Ben', 'Ollie']);

    await expect(karen.locator('text=The secret word is')).toBeVisible({ timeout: 10_000 });
    await expect(karen.locator('.role-card .rw')).toHaveText('Toast');
    await expect(ollie.locator('text=YOU are the Odd Sheep!')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'sheep-04-tv-deal');
    await shot(karen, 'sheep-05-phone-secret');
    await shot(ollie, 'sheep-06-phone-sheep');

    // ── Clues: Karen first — a board word is rejected, then a real clue ──
    await karen.getByRole('button', { name: /start the clues/ }).click();
    await expect(karen.locator('#clue-input')).toBeVisible({ timeout: 10_000 });
    await karen.locator('#clue-input').fill('Toast');
    await karen.getByRole('button', { name: /Say it/ }).click();
    await expect(karen.locator('#clue-err')).toContainText("can't use a word from the board", { timeout: 10_000 });
    await shot(karen, 'sheep-07-clue-rejected');
    await karen.locator('#clue-input').fill('butter');
    await karen.getByRole('button', { name: /Say it/ }).click();
    await expect(tv.locator('#v-wall')).toContainText('butter', { timeout: 10_000 });

    await expect(ben.locator('#clue-input')).toBeVisible({ timeout: 10_000 });
    await ben.locator('#clue-input').fill('crunchy');
    await ben.getByRole('button', { name: /Say it/ }).click();

    await expect(ollie.locator('#clue-input')).toBeVisible({ timeout: 10_000 });
    await ollie.locator('#clue-input').fill('yum');
    await ollie.getByRole('button', { name: /Say it/ }).click();
    // the last clue tips the round into the discussion phase — the wall moves to the rail
    await expect(tv.locator('.tv-rail')).toContainText('yum', { timeout: 10_000 });
    await shot(tv, 'sheep-08-tv-discuss-clues');

    // ── Discussion → captain jumps to the vote ──
    await expect(karen.getByRole('button', { name: /Enough talk/ })).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'sheep-09-phone-discuss');
    await karen.getByRole('button', { name: /Enough talk/ }).click();

    // ── Everyone votes: Ollie is caught 2–1 ──
    await expect(karen.locator('.vote-btn').first()).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'sheep-10-phone-vote');
    await karen.locator('.vote-btn', { hasText: 'Ollie' }).click();
    await ben.locator('.vote-btn', { hasText: 'Ollie' }).click();
    await ollie.locator('.vote-btn', { hasText: 'Karen' }).click();

    // ── Caught: Ollie guesses wrong (Cereal, not Toast) → busted ──
    await expect(ollie.locator('text=Guess the word')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('text=CAUGHT!')).toBeVisible({ timeout: 10_000 });
    await shot(ollie, 'sheep-11-sheep-guessing');
    await shot(tv, 'sheep-12-tv-caught');
    await ollie.locator('.wcell.pick', { hasText: 'Cereal' }).click();

    await expect(ollie.locator('text=Busted!')).toBeVisible({ timeout: 10_000 });
    await expect(karen.locator('.verdict .vpts')).toHaveText('+100');
    await expect(tv.locator('text=BUSTED')).toBeVisible({ timeout: 10_000 });
    await tv.waitForTimeout(1200); // tally bars animate in
    await shot(tv, 'sheep-13-tv-reveal');
    await shot(karen, 'sheep-14-phone-reveal');

    // ── Fast-forward: pretend this was the last round → podium ──
    await tv.evaluate(() => { H.round = H.settings.rounds; });
    await karen.getByRole('button', { name: /Next round/ }).click();
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=wins!')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1500);
    await shot(tv, 'sheep-15-tv-podium');
    await shot(karen, 'sheep-16-phone-podium');

    // ── Play again returns everyone to the lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ben, ollie].map(p => p.close()));
});

test('phone-first: host phone + TV viewer, first clue lands on the wall', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/oddsheep.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'sheep-20-host-lobby');

    // ── TV joins as viewer, Jess and Archie join ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/oddsheep.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open TV screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });
    const jess = await joinPhone(browser, code, 'Jess');
    const archie = await joinPhone(browser, code, 'Archie');
    await expect(neil.locator('.player-row')).toHaveCount(3, { timeout: 30_000 });

    // ── Start; rig Under the Sea, sheep = Archie, Neil clues first ──
    await neil.getByRole('button', { name: /Start the game/ }).click();
    await expect(tv.locator('.tv-wgrid')).toBeVisible({ timeout: 15_000 });
    await rig(neil, 1, 0, 'Archie', ['Neil', 'Jess', 'Archie']);
    await expect(neil.locator('.role-card .rw')).toHaveText('Shark', { timeout: 10_000 });

    await neil.getByRole('button', { name: /start the clues/ }).click();
    await expect(neil.locator('#clue-input')).toBeVisible({ timeout: 10_000 });
    await neil.locator('#clue-input').fill('bitey');
    await neil.getByRole('button', { name: /Say it/ }).click();
    await expect(tv.locator('#v-wall')).toContainText('bitey', { timeout: 10_000 });
    await shot(tv, 'sheep-21-tv-viewer-clues');
    await shot(neil, 'sheep-22-host-waiting');

    await Promise.all([tv, neil, jess, archie].map(p => p.close()));
});
