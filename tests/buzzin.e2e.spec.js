// E2E screenshot tour + functional test of Buzzin' (say-what-you-see rebus game).
//
// Plays a real game over PeerJS:
//   TV creates the room → 3 phones join → captain starts → a rebus shows on the TV
//   → EVERY phone gets a guess box + big red button → typeahead suggests real answers
//   → A submits a WRONG guess (A locked out; B/C keep typing) → B types the CORRECT
//   answer (read from H.cur.answer) + presses the red button → +1 and the phrase reveals
//   → drive to podium (rankByScore).
//
// Also captures a gallery of DIFFERENT rebus puzzles on the TV so the reviewer can
// verify each one READS as its phrase.
//
// Screenshots land in screenshots/ (buzzin-*.png).
//
// Run:  npx playwright test tests/buzzin.e2e.spec.js   (needs internet: PeerJS broker)

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';

function shot(page, name) { return page.screenshot({ path: `${SHOTS}/${name}.png` }); }

async function joinPhone(browser, code, name) {
    const p = await browser.newPage({ viewport: PHONE });
    await p.goto('/buzzin.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

test('type-and-submit round: typeahead, wrong locks out, correct scores, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const pageErrors = [];

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => pageErrors.push('tv: ' + e.message));
    await tv.goto('/buzzin.html');
    await shot(tv, 'buzzin-01-home');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── 3 phones join; Ava is captain ──
    const ava = await joinPhone(browser, code, 'Ava');
    ava.on('pageerror', e => pageErrors.push('ava: ' + e.message));
    await expect(ava.locator("text=Captain's Settings")).toBeVisible({ timeout: 30_000 });
    const ben = await joinPhone(browser, code, 'Ben');
    ben.on('pageerror', e => pageErrors.push('ben: ' + e.message));
    const cid = await joinPhone(browser, code, 'Cid');
    cid.on('pageerror', e => pageErrors.push('cid: ' + e.message));
    await expect(tv.locator('.cxl-chip')).toHaveCount(3, { timeout: 20_000 });
    await shot(tv, 'buzzin-02-tv-lobby');

    // Captain starts (default 12 puzzles)
    await ava.getByRole('button', { name: /Start buzzing/ }).click();

    // ── PUZZLE phase: TV shows the rebus; EVERY phone gets a guess box + red button ──
    await expect(tv.locator('.tv-rebus').first()).toBeVisible({ timeout: 15_000 });
    await expect(ava.locator('#guess-input')).toBeVisible({ timeout: 15_000 });
    await expect(ben.locator('#guess-input')).toBeVisible({ timeout: 15_000 });
    await expect(cid.locator('#guess-input')).toBeVisible({ timeout: 15_000 });
    await expect(ava.locator('.buzz-btn.big-red')).toBeVisible();
    await shot(tv, 'buzzin-03-tv-puzzle');
    await shot(ava, 'buzzin-04-phone-guessbox');

    // read the current answer deterministically from the host state
    const answer = await tv.evaluate(() => H.cur.answer);
    expect(typeof answer).toBe('string');

    // ── Typeahead: typing the start of the answer suggests real answers ──
    await ben.locator('#guess-input').fill(answer.slice(0, Math.max(2, Math.min(4, answer.length))));
    await ben.evaluate(() => onGuessInput(document.getElementById('guess-input').value));
    await expect(ben.locator('.ta-item').first()).toBeVisible({ timeout: 5_000 });
    await shot(ben, 'buzzin-06-phone-typeahead');

    // ── Ava submits a WRONG guess → she's locked out; Ben/Cid keep their box ──
    await ava.locator('#guess-input').fill('definitely not it zzz');
    await ava.locator('.buzz-btn.big-red').click();
    await expect(ava.locator('.locked-note')).toBeVisible({ timeout: 15_000 });
    await expect(ava.locator('#guess-input')).toHaveCount(0);       // Ava's box gone (she's out)
    await expect(ben.locator('#guess-input')).toBeVisible();        // Ben still in, undisturbed

    // ── Ben types the CORRECT answer + presses the red button → +1 and reveal ──
    await ben.locator('#guess-input').fill(answer);
    await ben.locator('.buzz-btn.big-red').click();

    // Ben sees the win verdict + the revealed phrase; TV shows Ben got it
    await expect(ben.locator('text=You got it!')).toBeVisible({ timeout: 15_000 });
    await expect(ben.locator('.verdict .vpts')).toHaveText('+1', { timeout: 10_000 });
    await expect(tv.locator('.tv-phrase')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.tv-prompt')).toContainText('got it', { timeout: 10_000 });
    // Ben's score is 1 on the host
    const benScore = await tv.evaluate(() => H.players.find(p => p.name === 'Ben').score);
    expect(benScore).toBe(1);
    await shot(tv, 'buzzin-07-tv-reveal');
    await shot(ben, 'buzzin-08-phone-correct');

    // ── Drive to podium: pretend that was the last puzzle ──
    await tv.evaluate(() => { H.pIndex = H.puzzles.length - 1; });
    // wait out the reveal auto-advance (REVEAL_MS) → podium
    await expect(tv.locator('.podium-wrap')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.pod')).not.toHaveCount(0);
    await tv.waitForTimeout(1400);   // pods rise in staggered
    await shot(tv, 'buzzin-09-tv-podium');
    // Ben (only scorer) tops the podium
    await expect(ben.locator('text=Ben wins!')).toBeVisible({ timeout: 15_000 });
    await shot(ben, 'buzzin-10-phone-podium');

    expect(pageErrors, `no page errors\n${pageErrors.join('\n')}`).toEqual([]);

    await Promise.all([tv, ava, ben, cid].map(p => p.close()));
});

// A gallery of different rebus puzzles on the TV so the reviewer can verify each READS.
test('rebus gallery: capture 6 different puzzles on the TV', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/buzzin.html');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });

    // Force a known, well-reading set of puzzles onto the host and render each on the TV.
    const picks = ['piece of cake', 'night owl', 'spelling bee', 'honeymoon', 'starfish', 'raining cats and dogs'];
    for (let i = 0; i < picks.length; i++) {
        await tv.evaluate((ans) => {
            const p = PUZZLES.find(x => x.answer === ans);
            H.puzzles = [{ ...p, pid: 'gal' }];
            H.pIndex = 0; H.cur = H.puzzles[0];
            H.phase = 'puzzle'; H.buzzedBy = null; H.lockedOut = [];
            applyViewerMsg(viewerPuzzleMsg());
        }, picks[i]);
        await expect(tv.locator('.tv-rebus .rtok.em').first()).toBeVisible({ timeout: 10_000 });
        await tv.waitForTimeout(900);   // let the tokens pop in
        await shot(tv, `buzzin-gallery-${String(i + 1).padStart(2, '0')}-${picks[i].replace(/\s+/g, '-')}`);
    }
    await tv.close();
});
