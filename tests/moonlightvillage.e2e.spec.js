// E2E screenshot tour of Moonlight Village.
//
// Plays a real game over PeerJS with 4 phones. Roles are forced via
// page.evaluate on the host page (the deal is random), but every action —
// ready, wolf kill, seer peek, healer protect, votes — goes through the real
// guest→host network path.
//
//   1. TV-first — captain lobby, hold-to-peek deal, night (kill + seer vision +
//      self-protect healer), dawn death, day skip, vote banishes the wolf →
//      Village wins → play again
//   2. Phone-first + TV viewer — healer save night → "everyone survived" dawn
//
// Screenshots land in screenshots/ (moon-*.png).
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
    await p.goto('/moonlightvillage.html?room=' + code);
    await p.locator('input[placeholder="Enter name"]').fill(name);
    await p.getByRole('button', { name: /Join with your phone/ }).click();
    return p;
}

// force deterministic roles on the host page, then rebroadcast
function forceRoles(hostPage, mapping) {
    return hostPage.evaluate(m => {
        for (const [name, role] of Object.entries(m)) {
            const p = H.players.find(q => q.name === name);
            p.role = role; p.seerSeen = [];
        }
        broadcastState();
    }, mapping);
}

test('TV-first: deal, night kill, seer vision, vote out the wolf → village wins', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    test.setTimeout(300_000);

    // ── TV founds the village ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/moonlightvillage.html');
    await shot(tv, 'moon-01-home');
    await tv.getByRole('button', { name: /Open the village on this screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 30_000 });
    const code = await tv.evaluate(() => roomCode);
    expect(code).toMatch(/^[A-Z]{4}$/);

    // ── Karen (captain), Ben, Archie, Ollie join ──
    const karen = await joinPhone(browser, code, 'Karen');
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 30_000 });
    const ben = await joinPhone(browser, code, 'Ben');
    const archie = await joinPhone(browser, code, 'Archie');
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(ollie.locator('.player-row')).toHaveCount(4, { timeout: 30_000 });
    await expect(tv.locator('.tv-pcard')).toHaveCount(4, { timeout: 15_000 });
    await shot(tv, 'moon-02-tv-lobby');
    await shot(karen, 'moon-03-captain-lobby');

    // Shortest discussion timer
    await karen.getByRole('button', { name: '60s', exact: true }).click();
    await karen.waitForTimeout(400);

    // ── Deal — force roles: Karen wolf, Ben seer, Archie healer, Ollie villager ──
    await karen.getByRole('button', { name: /Deal the roles/ }).click();
    await expect(karen.locator('.role-card')).toBeVisible({ timeout: 15_000 });
    await forceRoles(tv, { Karen: 'wolf', Ben: 'seer', Archie: 'healer', Ollie: 'villager' });
    await karen.waitForTimeout(400);

    // hold-to-peek: role hidden until pressed
    const secret = karen.locator('.role-card .secret');
    await expect(secret).toHaveCSS('opacity', '0');
    await karen.locator('.role-card').dispatchEvent('pointerdown');
    await expect(secret).toHaveCSS('opacity', '1');
    await expect(karen.locator('.role-card')).toContainText('Werewolf');
    await shot(karen, 'moon-04-role-peek');
    await karen.locator('.role-card').dispatchEvent('pointerup');

    for (const p of [karen, ben, archie, ollie])
        await p.getByRole('button', { name: /I've seen my role/ }).click();

    // ── Night 1 ──
    await expect(tv.locator('#tv-narrator')).toHaveAttribute('data-line', /Night falls/, { timeout: 15_000 });
    await shot(tv, 'moon-05-tv-night');
    // Karen (wolf) hunts Ollie
    await expect(karen.locator('.pickbtn').first()).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'moon-06-wolf-pick');
    await karen.locator('.pickbtn', { hasText: 'Ollie' }).click();
    // Ben (seer) peeks at Karen → WOLF!
    await ben.locator('.pickbtn', { hasText: 'Karen' }).click();
    await expect(ben.locator('#seer-result')).toContainText('KAREN IS A WOLF', { timeout: 10_000 });
    await shot(ben, 'moon-07-seer-vision');
    // Archie (healer) protects himself → Ollie dies
    await archie.locator('.pickbtn', { hasText: 'Archie' }).click();

    // ── Dawn: Ollie taken ──
    await expect(tv.locator('#tv-narrator')).toHaveAttribute('data-line', /Ollie does not/, { timeout: 15_000 });
    await expect(ollie.locator('text=The wolves came for you')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'moon-08-tv-dawn');
    await shot(ollie, 'moon-09-phone-dead');

    // ── Day (auto after 7s) → captain skips to the vote ──
    await expect(karen.getByRole('button', { name: /Skip straight to the vote/ })).toBeVisible({ timeout: 15_000 });
    await shot(tv, 'moon-10-tv-day');
    // dead Ollie is now a ghost spectator who can see all roles
    await expect(ollie.locator('text=watching from beyond')).toBeVisible();
    await expect(ollie.locator('.ghost-tile', { hasText: 'Karen' })).toContainText('Werewolf');
    await karen.getByRole('button', { name: /Skip straight to the vote/ }).click();

    // ── Vote: Ben and Archie vote Karen; Karen votes Ben ──
    await expect(karen.locator('#vote-wrap .pickbtn').first()).toBeVisible({ timeout: 10_000 });
    await shot(karen, 'moon-11-phone-vote');
    await karen.locator('#vote-wrap .pickbtn', { hasText: 'Ben' }).click();
    await ben.locator('#vote-wrap .pickbtn', { hasText: 'Karen' }).click();
    await archie.locator('#vote-wrap .pickbtn', { hasText: 'Karen' }).click();

    // ── Verdict: Karen banished (the only wolf) → Village wins ──
    await expect(tv.locator('#tv-narrator')).toHaveAttribute('data-line', /Karen is banished/, { timeout: 15_000 });
    await expect(karen.locator('text=You were banished!')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'moon-12-tv-verdict');
    await expect(tv.locator('#tv-narrator')).toHaveAttribute('data-line', /village is safe/, { timeout: 15_000 });
    await expect(ben.locator('text=Your team wins!')).toBeVisible({ timeout: 10_000 });
    await expect(karen.locator('text=Your team fell')).toBeVisible();
    await expect(tv.locator('.reveal-tile')).toHaveCount(4);
    await tv.waitForTimeout(1200);
    await shot(tv, 'moon-13-tv-finale');
    await shot(ben, 'moon-14-phone-win');

    // ── Play again → lobby with roles reshuffled ──
    await karen.getByRole('button', { name: /Play again/ }).click();
    await expect(karen.locator('text=Captain\'s Settings')).toBeVisible({ timeout: 15_000 });
    await expect(tv.locator('.qr-side .room-code')).toBeVisible({ timeout: 15_000 });

    await Promise.all([tv, karen, ben, archie, ollie].map(p => p.close()));
});

test('phone-first + TV viewer: healer save → everyone survives the night', async ({ browser }) => {
    fs.mkdirSync(SHOTS, { recursive: true });
    test.setTimeout(300_000);

    // ── Neil hosts on his phone ──
    const neil = await browser.newPage({ viewport: PHONE });
    await neil.goto('/moonlightvillage.html');
    await neil.locator('input[placeholder="Enter name"]').fill('Neil');
    await neil.getByRole('button', { name: /Host on this phone/ }).click();
    await expect(neil.locator('.room-code')).toBeVisible({ timeout: 30_000 });
    const code = await neil.evaluate(() => roomCode);
    await shot(neil, 'moon-20-host-lobby');

    // ── TV joins as narrator ──
    const tv = await browser.newPage({ viewport: TV });
    await tv.goto('/moonlightvillage.html');
    await tv.locator('input[placeholder="4-letter code"]').last().fill(code);
    await tv.getByRole('button', { name: /Open narrator screen/ }).click();
    await expect(tv.locator('.qr-side .room-code')).toHaveText(code, { timeout: 30_000 });

    // ── Jess, Ben, Ollie join (4 players) ──
    const jess = await joinPhone(browser, code, 'Jess');
    const ben = await joinPhone(browser, code, 'Ben');
    const ollie = await joinPhone(browser, code, 'Ollie');
    await expect(neil.locator('.player-row')).toHaveCount(4, { timeout: 30_000 });

    // ── Deal — Neil wolf, Jess seer, Ben healer, Ollie villager ──
    await neil.getByRole('button', { name: /Deal the roles/ }).click();
    await expect(neil.locator('.role-card')).toBeVisible({ timeout: 15_000 });
    await forceRoles(neil, { Neil: 'wolf', Jess: 'seer', Ben: 'healer', Ollie: 'villager' });
    await neil.waitForTimeout(400);
    for (const p of [neil, jess, ben, ollie])
        await p.getByRole('button', { name: /I've seen my role/ }).click();

    // ── Night: Neil hunts Ollie, Ben protects Ollie → save ──
    await expect(neil.locator('.pickbtn').first()).toBeVisible({ timeout: 15_000 });
    await neil.locator('.pickbtn', { hasText: 'Ollie' }).click();
    await jess.locator('.pickbtn', { hasText: 'Ben' }).click();       // seer: not a wolf
    await expect(jess.locator('#seer-result')).toContainText('not a wolf', { timeout: 10_000 });
    await ben.locator('.pickbtn', { hasText: 'Ollie' }).click();      // healer save!

    // ── Dawn: everyone survived ──
    await expect(tv.locator('#tv-narrator')).toHaveAttribute('data-line', /everyone is still here/, { timeout: 15_000 });
    await expect(ollie.locator('text=Everyone survived the night!')).toBeVisible({ timeout: 10_000 });
    await shot(tv, 'moon-21-tv-dawn-saved');
    await shot(ollie, 'moon-22-phone-saved');

    await Promise.all([tv, neil, jess, ben, ollie].map(p => p.close()));
});
