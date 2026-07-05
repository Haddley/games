// E2E screenshot tour of Boggle Party.
//
// Plays a real game over PeerJS: a host phone, two player phones, and a TV
// scoreboard, all as separate pages. Words are submitted through the real
// guest->host network path (the host validates length/dictionary/duplicates),
// and the round is fast-forwarded by shrinking the host's timer.
//
// Screenshots land in screenshots/ — eyeball them to confirm each screen.
//
// Run:  npm run test:e2e        (needs internet: PeerJS broker + dictionary)

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';

function shot(page, name) {
    return page.screenshot({ path: `${SHOTS}/${name}.png` });
}

test('full game flow: lobby, gameplay, round results, game over', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });

    // ── Host phone creates the party ──
    const host = await browser.newPage({ viewport: PHONE });
    await host.goto('/boggleparty.html');
    await shot(host, '01-home');

    await host.locator('.card', { hasText: 'Host a Party' }).locator('input').fill('Neil');
    await host.getByRole('button', { name: /Host Party/ }).click();
    await expect(host.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await host.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // One round so this round's results are the final ones
    await host.getByRole('button', { name: '1', exact: true }).click();

    // ── TV scoreboard joins ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/boggleparty.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open Scoreboard/ }).click();
    await expect(tv.locator('.v-lobby-code')).toHaveText(code, { timeout: 30_000 });

    // ── Two players join via the QR link ──
    async function join(name) {
        const p = await browser.newPage({ viewport: PHONE });
        await p.goto('/boggleparty.html?room=' + code);
        await p.locator('.card', { hasText: 'Join a Party' }).locator('input').nth(1).fill(name);
        await p.getByRole('button', { name: /Join with your phone/ }).click();
        await expect(p.locator('.room-code')).toBeVisible({ timeout: 30_000 });
        return p;
    }
    const ann = await join('Ann');
    const bob = await join('Bob');

    // All lobbies show 3 players before we start
    await expect(host.locator('.player-row')).toHaveCount(3, { timeout: 15_000 });
    await expect(tv.locator('.v-chip')).toHaveCount(3, { timeout: 15_000 });
    await shot(host, '02-host-lobby');
    await shot(ann, '03-guest-lobby');
    await shot(tv, '04-tv-lobby-qr');

    // Wait for the dictionary so submitted words are judged for real
    // (if the fetch fails the game accepts all words — tests still pass)
    await host.locator('text=Dictionary ready').waitFor({ timeout: 30_000 }).catch(() => {});

    // ── START GAME ──
    await host.getByRole('button', { name: /Start Round 1/ }).click();
    await host.waitForTimeout(900);
    await shot(ann, '05-round-countdown');
    await host.waitForTimeout(3200); // 3-2-1-GO finishes, timer starts
    await expect(host.locator('#timer-ring')).toBeVisible({ timeout: 10_000 });
    await shot(host, '06-phone-game');
    await shot(tv, '07-tv-game');

    // ── Gameplay: submit real words through the network path.
    //    Ann races to a 4-word streak; Bob's 6-letter word takes the lead
    //    (words are judged against the dictionary only, not board adjacency,
    //    so any common word works regardless of the rolled board) ──
    const say = (page, word) => page.evaluate(w => send(hostConn, { type: 'word', word: w }), word);
    for (const w of ['cat', 'tree', 'rain', 'stone']) { await say(ann, w); await ann.waitForTimeout(250); }
    for (const w of ['dog', 'cat', 'quartz']) { await say(bob, w); await bob.waitForTimeout(250); }

    // Feed should show finds, the streak, and a lead change
    await expect(tv.locator('.v-feed-item').first()).toBeVisible({ timeout: 10_000 });
    await tv.waitForTimeout(1200);
    await shot(tv, '08-tv-live-feed');
    await shot(ann, '09-phone-mid-round');

    // ── Final-10-seconds mode on the TV ──
    await host.evaluate(() => { H.timeLeft = 10; });
    await expect(tv.locator('.v-count-num')).toBeVisible({ timeout: 5_000 });
    await shot(tv, '10-tv-final-countdown');

    // ── END OF ROUND ──
    await host.evaluate(() => { H.timeLeft = 1; });
    await expect(host.getByRole('button', { name: /Final Podium/ })).toBeVisible({ timeout: 15_000 });
    await expect(ann.locator('.lb-rows')).toBeVisible({ timeout: 15_000 });
    await shot(ann, '11-phone-round-results');
    await shot(host, '12-host-round-results');
    // Let the TV reveal theater finish (word chips, then both missed-word
    // sections stagger in) before capturing
    await tv.waitForTimeout(9_000);
    await expect(tv.locator('.v-join-corner svg')).toBeVisible(); // join QR on results
    await shot(tv, '13-tv-round-results');

    // ── END OF GAME ──
    await host.getByRole('button', { name: /Final Podium/ }).click();
    await expect(tv.locator('.v-go-winner')).toBeVisible({ timeout: 15_000 });
    await expect(ann.locator('.winner-name')).toBeVisible({ timeout: 15_000 });
    await ann.waitForTimeout(2_500); // podium rise + hall-of-fame stagger
    await shot(ann, '14-phone-gameover');
    await shot(host, '15-host-gameover');
    await shot(tv, '16-tv-gameover');

    // Sanity: Ann wins — base 650 + unique bonus 550 (tree/rain/stone) = 1200
    // vs Bob's base 600 + unique bonus 500 (dog/quartz) = 1100. The shared
    // "cat" is unique for neither.
    const winner = await host.evaluate(() => H.winner);
    expect(winner).toBe('Ann');
});
