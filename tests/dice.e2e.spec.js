// The shared die (dice.js), tested on its own rather than through a game: every value
// lands showing the right face, throws vary in length, and a re-render mid-throw snaps
// to the result instead of leaving the cube at a random angle.
//
// It's mounted onto a bare game page, which is also the check that a game needs no
// markup or CSS of its own to use it.
//
// Run:  npx playwright test tests/dice.e2e.spec.js

const { test, expect } = require('@playwright/test');

// whatever is actually painted at the centre of the die IS the face you're looking at
const frontFace = page => page.evaluate(() => {
    const r = document.querySelector('.d3d').getBoundingClientRect();
    let el = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    while (el && !el.classList.contains('d3d-face')) el = el.parentElement;
    if (!el) return { face: null, pips: -1 };
    const m = el.className.match(/d3d-f(\d)/);
    return { face: m ? Number(m[1]) : null, pips: el.querySelectorAll('.d3d-pip').length };
});

async function mount(page, opts) {
    await page.goto('/plumptrek.html', { waitUntil: 'load' });     // any page that loads dice.js
    await page.evaluate(o => {
        document.getElementById('app').innerHTML = diceHTML(o);
    }, opts || { id: 'd', cls: 'die' });
}

test('every value lands on its own face, with the right pips', async ({ page }) => {
    await mount(page);
    for (let v = 1; v <= 6; v++) {
        await page.evaluate(n => settleDie('d', n), v);
        await page.waitForTimeout(120);
        expect(await frontFace(page), `asked for ${v}`).toEqual({ face: v, pips: v });
    }
});

test('a real throw ends on the value it was given', async ({ page }) => {
    await mount(page);
    for (const v of [6, 2, 5]) {
        const ms = await page.evaluate(n => throwDie('d', n), v);
        expect(ms, 'the throw reports its own duration').toBeGreaterThan(300);
        await page.waitForTimeout(ms + 400);
        expect((await frontFace(page)).face, `threw a ${v}`).toBe(v);
    }
});

test('no two throws are the same length, and none outstay their welcome', async ({ page }) => {
    await mount(page);
    const durs = [];
    for (let i = 0; i < 14; i++) durs.push(await page.evaluate(() => throwDie('d', 3)));
    expect(new Set(durs).size, `varied: ${durs.join(',')}`).toBeGreaterThan(7);
    expect(Math.min(...durs)).toBeGreaterThan(400);
    expect(Math.max(...durs)).toBeLessThan(1550);       // Plump Trek's DIE_WAIT budget
});

test('the cube never scales — dice do not grow as they land', async ({ page }) => {
    await mount(page);
    const base = await page.evaluate(() => document.querySelector('.d3d-cube').getBoundingClientRect().width);
    const ms = await page.evaluate(() => throwDie('d', 4));
    const seen = [];
    for (let i = 0; i < 12; i++) {
        seen.push(await page.evaluate(() => Math.round(document.querySelector('.d3d-cube').getBoundingClientRect().width)));
        await page.waitForTimeout(Math.round(ms / 8));
    }
    // a rotating cube's BOX grows a little (perspective), but never like a 1.14 scale pop
    expect(Math.max(...seen)).toBeLessThanOrEqual(Math.round(base * 1.45));
});

test('settleDie snaps mid-throw instead of animating a correction', async ({ page }) => {
    await mount(page);
    await page.evaluate(() => throwDie('d', 6));
    await page.waitForTimeout(200);                     // catch it in the air
    await page.evaluate(() => settleDie('d', 2));
    expect(await page.evaluate(() => document.querySelector('.d3d-cube').classList.contains('d3d-throwing')))
        .toBe(false, 'the transition is off, so there is no glide');
    await page.waitForTimeout(120);
    expect((await frontFace(page)).face).toBe(2);
});

test('onTick fires as it leaves the hand, onLand as it settles', async ({ page }) => {
    await mount(page);
    const events = await page.evaluate(() => new Promise(resolve => {
        const log = [];
        const ms = throwDie('d', 3, {
            onTick: d => log.push(['tick', d]),
            onLand: () => log.push(['land', Date.now()]),
        });
        setTimeout(() => resolve({ log: log.map(e => e[0]), reported: ms, tickArg: log[0] && log[0][1] }), ms + 400);
    }));
    expect(events.log).toEqual(['tick', 'land']);
    expect(events.tickArg, 'onTick is handed the duration so audio can match it').toBe(events.reported);
});

test('a die over six shows numerals, because pips stop being readable', async ({ page }) => {
    await mount(page, { id: 'd', value: 17, sides: 20, cls: 'die' });
    await page.evaluate(() => settleDie('d', 17));
    await page.waitForTimeout(120);
    expect((await frontFace(page)).pips).toBe(0);
    await expect(page.locator('.d3d-f1 .d3d-num')).toHaveText('17');
});

test('a game needs no markup or CSS of its own — the component brings both', async ({ page }) => {
    await page.goto('/plumptrek.html', { waitUntil: 'load' });
    // the stylesheet is injected on FIRST USE, not at load: a game that never rolls a die
    // pays nothing for having the file
    await expect(page.locator('#dice-style')).toHaveCount(0);
    await page.evaluate(() => { document.getElementById('app').innerHTML = diceHTML({ id: 'x' }) + diceHTML({ id: 'y' }); });
    await expect(page.locator('#dice-style')).toHaveCount(1, 'injected once, however many dice');
    // two independent dice on one screen
    await page.evaluate(() => { settleDie('x', 1); settleDie('y', 6); });
    await page.waitForTimeout(150);
    const boxes = await page.locator('.d3d-cube').evaluateAll(els => els.map(e => e.style.transform));
    expect(boxes[0]).not.toBe(boxes[1]);
});
