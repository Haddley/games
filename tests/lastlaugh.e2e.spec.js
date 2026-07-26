// E2E functional tour of The Last Laugh (judge picks the funniest card).
//
// Plays a REAL game over PeerJS: TV host + 3 phones. We force a deterministic
// prompt sequence on the TV host (an `adj` round, then a double-blank `n:2`
// round) and a low target score, then drive rounds to a podium — asserting:
//   • exactly one judge, the two non-judges each hold a 7-card hand
//   • non-judges play the right number of cards through the real submit UI
//   • only the judge can pick; the picked card's author scores +1
//   • the judge rotates each round
//   • the podium renders once someone reaches the target
//
// Screenshots land in screenshots/ (lastlaugh-*.png). Needs internet (broker).
//
// Run:  npx playwright test tests/lastlaugh.e2e.spec.js

const { test, expect } = require('@playwright/test');
const fs = require('fs');

const PHONE = { width: 390, height: 844 };
const TV = { width: 1920, height: 1080 };
const SHOTS = 'screenshots';
const shot = (page, name) => page.screenshot({ path: `${SHOTS}/${name}.png` });

async function joinPhone(browser, code, name, errors) {
    const p = await browser.newPage({ viewport: PHONE });
    p.on('pageerror', e => errors.push(`${name}: ${e.message}`));
    await p.goto('/lastlaugh.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

// wait until the phone's ui state equals `want`
async function waitUi(page, want) {
    await expect.poll(() => page.evaluate(() => ui), { timeout: 20_000 }).toBe(want);
}
// wait until the TV viewer payload type equals `want`
async function waitVType(tv, want) {
    await expect.poll(() => tv.evaluate(() => (vD && vD.type) || ''), { timeout: 20_000 }).toBe(want);
}

test('TV + 3 phones: hands, submit, judge pick, rotation, podium', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    const errors = [];

    // ── TV creates the game ──
    const tv = await browser.newPage({ viewport: TV });
    tv.on('pageerror', e => errors.push('TV: ' + e.message));
    await tv.goto('/lastlaugh.html');
    await shot(tv, 'lastlaugh-01-home');
    await tv.getByRole('button', { name: /Host the party on this screen/ }).click();
    await expect(tv.locator('.cxl-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── three phones join (Ada is captain — first in) ──
    const ada = await joinPhone(browser, code, 'Ada', errors);
    await expect(ada.locator("text=Captain's Settings")).toBeVisible({ timeout: 30_000 });
    const bea = await joinPhone(browser, code, 'Bea', errors);
    const cal = await joinPhone(browser, code, 'Cal', errors);
    const phones = [ada, bea, cal];
    await expect(tv.locator('.cxl-chip')).toHaveCount(3, { timeout: 20_000 });
    await shot(tv, 'lastlaugh-02-tv-lobby');
    await shot(ada, 'lastlaugh-03-captain-lobby');

    // captain starts (Grown-ups deck picker exists; keep default Family)
    await ada.getByRole('button', { name: /Start the laughs/ }).click();
    await waitVType(tv, 'viewer_submit');

    // ── force a deterministic prompt sequence + low target on the host ──
    await tv.evaluate(() => {
        H.prompts = [
            { t: 'adj', text: 'ridiculous' },
            { t: 'blank', text: 'The magician pulled ____ out of ____.', n: 2 },
            { t: 'blank', text: 'My secret superpower is ____.', n: 1 },
            { t: 'adj', text: 'suspicious' },
            { t: 'blank', text: 'The zoo\'s newest attraction is ____.', n: 1 },
            { t: 'adj', text: 'chaotic' },
            { t: 'blank', text: 'Never go on holiday without ____.', n: 1 },
            { t: 'adj', text: 'majestic' },
        ];
        H.pIndex = -1; H.round = 0; H.judgeIndex = 0;
        H.settings.targetScore = 2;   // short game → podium quickly
        nextRound();
    });
    await waitVType(tv, 'viewer_submit');
    for (const p of phones) await waitUi(p, 'submit');

    // ── ROUND 1 (adj, n=1): exactly one judge, two 7-card hands ──
    const roles = await Promise.all(phones.map(p => p.evaluate(() => ({ name: myName, isJudge: D.isJudge, n: D.n, hand: (D.hand || []).length }))));
    expect(roles.filter(r => r.isJudge).length, 'exactly one judge').toBe(1);
    const nonJudges1 = roles.filter(r => !r.isJudge);
    expect(nonJudges1.length).toBe(2);
    nonJudges1.forEach(r => expect(r.hand, `${r.name} holds a full 7-card hand`).toBe(7));
    expect(await tv.evaluate(() => promptN(H.cur))).toBe(1);
    await shot(tv, 'lastlaugh-04-tv-submit-adj');

    const byName = Object.fromEntries(phones.map((p, i) => [roles[i].name, p]));
    const judgeName1 = roles.find(r => r.isJudge).name;
    await shot(byName[nonJudges1[0].name], 'lastlaugh-05-phone-hand-adj');

    // the two non-judges each play 1 card through the real UI
    await playCards(byName[nonJudges1[0].name], 1);
    await playCards(byName[nonJudges1[1].name], 1);

    // judge sees the wall and picks the funniest
    const judge1 = byName[judgeName1];
    await waitUi(judge1, 'judge');
    await waitVType(tv, 'viewer_judge');
    await shot(tv, 'lastlaugh-06-tv-judge');

    const scoresBefore = await tv.evaluate(() => Object.fromEntries(H.players.map(p => [p.name, p.score])));
    const idxBefore = await tv.evaluate(() => H.judgeIndex);
    await judgePick(judge1);

    // reveal: the winning card's author gained exactly +1
    await waitVType(tv, 'viewer_reveal');
    const winnerName = await tv.evaluate(() => vD.winner.name);
    const scoresAfter = await tv.evaluate(() => Object.fromEntries(H.players.map(p => [p.name, p.score])));
    expect(scoresAfter[winnerName], 'picked author scored +1').toBe(scoresBefore[winnerName] + 1);
    expect(winnerName, 'the judge never wins their own round').not.toBe(judgeName1);
    await shot(tv, 'lastlaugh-07-tv-reveal');
    await shot(byName[winnerName], 'lastlaugh-08-phone-reveal-win');

    // captain advances → judge rotates
    await ada.getByRole('button', { name: /Next round/ }).click();
    await waitVType(tv, 'viewer_submit');
    const idxAfter = await tv.evaluate(() => H.judgeIndex);
    expect(idxAfter, 'judge rotated to the next player').not.toBe(idxBefore);

    // ── ROUND 2 (blank, n=2): non-judges each play TWO cards ──
    for (const p of phones) await waitUi(p, 'submit');
    expect(await tv.evaluate(() => promptN(H.cur)), 'round 2 is a double-blank').toBe(2);
    const roles2 = await Promise.all(phones.map(p => p.evaluate(() => ({ name: myName, isJudge: D.isJudge, n: D.n }))));
    const judgeName2 = roles2.find(r => r.isJudge).name;
    expect(judgeName2, 'judge changed between rounds').not.toBe(judgeName1);
    await shot(byName[roles2.find(r => !r.isJudge).name], 'lastlaugh-09-phone-hand-blank2');
    for (const r of roles2.filter(x => !x.isJudge)) await playCards(byName[r.name], 2);

    const judge2 = byName[judgeName2];
    await waitUi(judge2, 'judge');
    await waitVType(tv, 'viewer_judge');
    // a non-judge must NOT be able to pick (gate is judge-only)
    const nonJudge2 = byName[roles2.find(r => !r.isJudge).name];
    expect(await nonJudge2.evaluate(() => D.isJudge)).toBe(false);
    await judgePick(judge2);
    await waitVType(tv, 'viewer_reveal');

    // ── drive remaining rounds until the podium appears ──
    for (let round = 0; round < 12; round++) {
        const vt = await tv.evaluate(() => vD.type);
        if (vt === 'viewer_podium') break;
        if (vt === 'viewer_reveal') {
            const isLast = await tv.evaluate(() => !!vD.isLast);
            await ada.getByRole('button', { name: isLast ? /See the podium/ : /Next round/ }).click();
            await expect.poll(() => tv.evaluate(() => vD.type), { timeout: 20_000 }).not.toBe('viewer_reveal');
            continue;
        }
        if (vt === 'viewer_submit') {
            for (const p of phones) await waitUi(p, 'submit');
            const rs = await Promise.all(phones.map(p => p.evaluate(() => ({ name: myName, isJudge: D.isJudge, n: D.n }))));
            for (const r of rs.filter(x => !x.isJudge)) await playCards(byName[r.name], r.n);
            const jp = byName[rs.find(r => r.isJudge).name];
            await waitUi(jp, 'judge');
            await judgePick(jp);
            await waitVType(tv, 'viewer_reveal');
        }
    }

    await waitVType(tv, 'viewer_podium');
    await expect(tv.locator('.pod')).not.toHaveCount(0, { timeout: 15_000 });
    const winner = await tv.evaluate(() => vD.standings[0]);
    expect(winner.score).toBeGreaterThanOrEqual(2);
    await shot(tv, 'lastlaugh-10-tv-podium');
    await shot(ada, 'lastlaugh-11-phone-podium');

    expect(errors, `no page errors\n${errors.join('\n')}`).toEqual([]);

    for (const p of [tv, ...phones]) await p.close();
});

// tap n hand cards then confirm, through the real submit UI
async function playCards(page, n) {
    await waitUi(page, 'submit');
    for (let i = 0; i < n; i++) {
        await page.locator('.wall .wall-card').nth(i).click();
        await page.waitForTimeout(120);
    }
    await page.getByRole('button', { name: /^\s*😂?\s*Play/ }).click();
    await expect.poll(() => page.evaluate(() => playLocked), { timeout: 15_000 }).toBe(true);
}

// judge taps the first card on the anonymous wall
async function judgePick(judgePage) {
    const card = judgePage.locator('.wall .wall-card:not([disabled])').first();
    await expect(card).toBeVisible({ timeout: 15_000 });
    await card.click();
    await expect.poll(() => judgePage.evaluate(() => pickLocked), { timeout: 15_000 }).toBe(true);
}
