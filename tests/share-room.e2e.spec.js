// Every player in a TV-hosted room can pass the room on.
//
// The TV shows a QR code, which is perfect for the people sitting in front of it and useless
// for anyone who isn't — you cannot forward a television to a phone in another house. So the
// lobby carries the room code, Copy link and Share on EVERY player's phone.
//
// Not just the captain's: the person with the group chat open is rarely the person who
// joined first. That is the assertion that would have caught this being wired only for the
// captain, which is the easy mistake here (and the shape of the RPS "Play again" bug earlier
// in this session, where the TV named a control that no phone actually had).
//
// Run:  npx playwright test tests/share-room.e2e.spec.js

const { test, expect } = require('@playwright/test');
const { GAMES, PHONE, TV, openRoom, joinFresh, seatNames } = require('./games');

const nameSel = spec => spec.nameSel || spec.name || 'input[placeholder="Enter name"]';

test.describe.configure({ retries: 1 });
test.setTimeout(90_000);

for (const spec of GAMES) {
    test(`${spec.g}: every player in the lobby can share the room`, async ({ browser }) => {
        const { tv, code } = await openRoom(browser, spec);
        const cap = await joinFresh(browser, spec, code, 'Ava');
        const other = await joinFresh(browser, spec, code, 'Ben');
        // let both lobbies settle
        await expect.poll(() => other.page.locator('.share-room').count(), { timeout: 30_000 })
            .toBeGreaterThan(0);

        for (const [who, p] of [['captain', cap.page], ['other player', other.page]]) {
            await expect(p.locator('.share-room'),
                `${spec.g}: the ${who} has no way to pass the room on`).toBeVisible({ timeout: 20_000 });
            await expect(p.getByRole('button', { name: /Copy link/ }),
                `${spec.g}: the ${who} has no Copy link`).toBeVisible();
            await expect(p.getByRole('button', { name: /Share/ }),
                `${spec.g}: the ${who} has no Share`).toBeVisible();
            // the code itself must be readable — somebody will always read it out loud
            await expect(p.locator('.share-room'),
                `${spec.g}: the ${who} cannot see the room code`).toContainText(code);
        }

        // and the link it copies actually points at this room
        const url = await cap.page.evaluate(() => {
            const b = document.querySelector('.share-room-btns button');
            // the attribute is onclick='copyRoomLink("…", this)' — JSON.stringify emits
            // DOUBLE quotes inside the single-quoted attribute
            const m = b && /copyRoomLink\(\s*["']([^"']+)["']/.exec(b.getAttribute('onclick') || '');
            return m ? m[1] : null;
        });
        expect(url, `${spec.g}: the Copy link button has no link in it`).toBeTruthy();
        expect(url, `${spec.g}: the link does not carry the room code`).toContain(code);
        expect(url, `${spec.g}: the link points at a different game`).toContain(`${spec.g}.html`);

        // …and the only test that really matters: somebody who was NOT in the room follows
        // that link, cold, and gets in. A Copy link button that produces a plausible-looking
        // URL nobody can actually use is worse than no button — and one round of this did
        // exactly that (".../herdmind.html?room=" with no code), rendering perfectly.
        const remoteCtx = await browser.newContext({ viewport: PHONE });
        const remote = await remoteCtx.newPage();
        await remote.goto(url);
        const prefilled = await remote.evaluate(() =>
            [...document.querySelectorAll('input')].map(i => i.value).filter(v => /^[A-Z]{4}$/.test(v)));
        expect(prefilled, `${spec.g}: following the link did not fill the code in`).toContain(code);
        await remote.locator(nameSel(spec)).first().fill('Remote');
        if (spec.joinSel) await remote.locator(spec.joinSel).click();
        else await remote.getByRole('button', { name: spec.join }).first().click();
        await expect.poll(() => seatNames(tv, spec),
            { timeout: 30_000, message: `${spec.g}: a remote player followed the shared link and never arrived` })
            .toContain('Remote');

        await remoteCtx.close();
        await cap.ctx.close(); await other.ctx.close(); await tv.close();
    });
}
