// E2E screenshot tour of Broken Pencil.
//
// Plays a real game over PeerJS. Covers:
//   1. TV-first — 3 phones (Karen 👑 captain, Ben, Ollie): write → draw (real
//      mouse strokes) → describe, reveal theatre with 😂, funniest-beat vote,
//      fast-forward to podium, Play Again
//   2. Phone-first + TV viewer — 2-player shortCircuit mode (test hook)
//
// Screenshots land in screenshots/ (pencil-*.png).
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
    await p.goto('/brokenpencil.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

async function scribble(page) {
    const box = await page.locator('#draw-cv').boundingBox();
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await page.mouse.move(box.x + 30, box.y + 30);
    await page.mouse.down();
    await page.mouse.move(cx, cy, { steps: 6 });
    await page.mouse.move(box.x + box.width - 40, box.y + 60, { steps: 6 });
    await page.mouse.up();
    await page.mouse.move(box.x + 40, box.y + box.height - 40);
    await page.mouse.down();
    await page.mouse.move(cx, cy - 20, { steps: 5 });
    await page.mouse.up();
}

async function writeAndSend(page, text) {
    await expect(page.locator('#w-text')).toBeVisible({ timeout: 15_000 });
    await page.locator('#w-text').fill(text);
    await page.getByRole('button', { name: /Send it!/ }).click();
    await expect(page.locator('text=Sent it!')).toBeVisible({ timeout: 10_000 });
}

async function drawAndSend(page) {
    await expect(page.locator('#draw-cv')).toBeVisible({ timeout: 15_000 });
    await scribble(page);
    await page.getByRole('button', { name: /Send it!/ }).click();
    await expect(page.locator('text=Sent it!')).toBeVisible({ timeout: 10_000 });
}

test('TV-first: write→draw→describe, reveal theatre, LOL, vote, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/brokenpencil.html');
    await shot(tv, 'pencil-01-home');
    await tv.getByRole('button', { name: /Create the game on this screen/ }).click();
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
    await shot(tv, 'pencil-02-tv-lobby');
    await shot(karen, 'pencil-03-captain-lobby');

    // ── Start → WRITE step ──
    await karen.getByRole('button', { name: /Start the game/ }).click();
    await expect(karen.locator('#w-text')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.tv-wall .wcard')).toHaveCount(3, { timeout: 15_000 });
    await shot(tv, 'pencil-04-tv-write-wall');

    // Karen uses the dice, the others type
    await karen.getByRole('button', { name: /Surprise me/ }).click();
    await shot(karen, 'pencil-05-phone-write');
    await karen.getByRole('button', { name: /Send it!/ }).click();
    await expect(karen.locator('text=Sent it!')).toBeVisible({ timeout: 10_000 });
    await writeAndSend(ben, 'a robot walking a goldfish');
    await writeAndSend(ollie, 'grandma on a rocket');

    // ── DRAW step (real mouse strokes) ──
    await drawAndSend(karen);
    await shot(ben, 'pencil-06-phone-draw');
    await drawAndSend(ben);
    await drawAndSend(ollie);

    // ── DESCRIBE step (each phone shows a drawing) ──
    await expect(karen.locator('#view-cv')).toBeVisible({ timeout: 15_000 });
    await shot(karen, 'pencil-07-phone-describe');
    await writeAndSend(karen, 'a confused potato in the rain');
    await writeAndSend(ben, 'two snakes having an argument');
    await writeAndSend(ollie, 'definitely a dinosaur');

    // ── REVEAL theatre: beat 1 = the prompt ──
    await expect(tv.locator('.beat-paper')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=Watch the TV!')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1600); // typewriter
    await shot(tv, 'pencil-08-tv-reveal-prompt');
    await shot(ollie, 'pencil-09-phone-reveal-lol');

    // Ollie LOLs at Karen's prompt (beat author = chain owner = Karen)
    await ollie.locator('.lol-btn').click();
    await tv.waitForTimeout(400);
    const lols = await tv.evaluate(() => H.players.reduce((s, p) => s + p.lols, 0));
    expect(lols).toBeGreaterThanOrEqual(1);

    // Beat 2: the drawing replays stroke by stroke
    await karen.getByRole('button', { name: /Next/ }).click();
    await expect(tv.locator('#beat-cv')).toBeVisible({ timeout: 10_000 });
    await tv.waitForTimeout(2600); // stroke replay
    await shot(tv, 'pencil-10-tv-reveal-drawing');

    // Beat 3: the description
    await karen.getByRole('button', { name: /Next/ }).click();
    await expect(tv.locator('#beat-text')).toBeVisible({ timeout: 10_000 });
    await tv.waitForTimeout(1600);
    await shot(tv, 'pencil-11-tv-reveal-description');

    // ── VOTE for the funniest beat ──
    await karen.getByRole('button', { name: /Vote for the funniest/ }).click();
    for (const p of [karen, ben, ollie]) {
        await expect(p.locator('.vote-opt').first()).toBeVisible({ timeout: 15_000 });
        await p.locator('.vote-opt:not(.mine)').first().click();
    }
    await expect(tv.locator('text=The votes are in!')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=The votes are in')).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'pencil-12-tv-voted');
    await shot(karen, 'pencil-13-phone-voted');

    // ── Fast-forward: pretend this was the last chain → podium ──
    await tv.evaluate(() => { H.revealChain = H.chains.length - 1; });
    await karen.getByRole('button', { name: /Next chain/ }).click();
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(karen.locator('text=wins!')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1500);
    await shot(tv, 'pencil-14-tv-podium');
    await shot(karen, 'pencil-15-phone-podium');

    // ── Play again → lobby ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ben, ollie].map(p => p.close()));
});

test('phone-first + TV viewer: 2-player shortCircuit write→draw→reveal→podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/brokenpencil.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'pencil-20-host-lobby');

    // ── TV joins as viewer, Jess joins ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/brokenpencil.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open TV screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });
    const jess = await joinPhone(browser, code, 'Jess');
    await expect(neil.locator('.player-row')).toHaveCount(2, { timeout: 30_000 });

    // shortCircuit test hook allows a 2-player game (steps: write, draw)
    await neil.evaluate(() => { H.settings.shortCircuit = true; });
    await neil.getByRole('button', { name: /Start the game/ }).click();

    await writeAndSend(neil, 'a cat stuck in a teapot');
    await writeAndSend(jess, 'dad asleep in a deckchair');
    await drawAndSend(neil);
    await drawAndSend(jess);

    // ── Reveal on the viewer TV ──
    await expect(tv.locator('.beat-paper')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1600);
    await shot(tv, 'pencil-21-viewer-reveal');
    await neil.getByRole('button', { name: /Next/ }).click();     // drawing beat
    await expect(tv.locator('#beat-cv')).toBeVisible({ timeout: 10_000 });
    await tv.waitForTimeout(2600);
    await shot(tv, 'pencil-22-viewer-reveal-drawing');

    // Vote (each player has exactly one votable beat), then jump to podium
    await neil.getByRole('button', { name: /Vote for the funniest/ }).click();
    for (const p of [neil, jess]) {
        await expect(p.locator('.vote-opt').first()).toBeVisible({ timeout: 15_000 });
        await p.locator('.vote-opt:not(.mine)').first().click();
    }
    await expect(neil.locator('text=The votes are in')).toBeVisible({ timeout: 15_000 });
    await neil.evaluate(() => { H.revealChain = H.chains.length - 1; });
    await neil.getByRole('button', { name: /Next chain/ }).click();
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await tv.waitForTimeout(1200);
    await shot(tv, 'pencil-23-viewer-podium');

    await Promise.all([tv, neil, jess].map(p => p.close()));
});
