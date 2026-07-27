#!/usr/bin/env node
// Regenerate the `const LOTS = [...]` block inside goinggone.html from the researched JSON.
//
// The JSON files are the SOURCE; goinggone.html carries an embedded copy because the games are
// static HTML served straight from the repo root with no build step (see CLAUDE.md). This is the
// same arrangement as familytrivia-pack.json -> FAMILY_PACK. Edit the JSON, then run:
//
//   node scripts/build-goinggone-lots.js
//
// It rewrites goinggone.html in place and prints what changed. unit/goinggone.test.js fails if
// the embed drifts from the JSON, so a forgotten run is caught by the test suite rather than by
// somebody noticing a wrong price mid-game.

const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const SOURCES = ['data/goinggone-lots-real.json', 'data/goinggone-lots-catalogue.json'];
const TARGET = path.join(ROOT, 'goinggone.html');

// Short, human labels for the card ("WebstaurantStore · Jul 2026"). A hostname is the honest
// fallback — better a slightly ugly label than a wrong one.
const HOSTS = {
    'webstaurantstore.com': 'WebstaurantStore',
    'trafficsafetystore.com': 'Traffic Safety Store',
    'roguefitness.com': 'Rogue Fitness',
    'armysurpluswarehouse.com': 'Army Surplus Warehouse',
    'adafruit.com': 'Adafruit',
    'sparkfun.com': 'SparkFun',
    'prusa3d.com': 'Prusa',
    'mrsolar.com': 'Mr Solar',
    'surpluscenter.com': 'Surplus Center',
    'accio.com': 'Accio',
    'bowlersmart.com': 'BowlersMart',
    'usamechanicalbulls.com': 'USA Mechanical Bulls',
    'storageandcanopy.com': 'Storage & Canopy',
    'apple.com': 'Apple',
    'nvidia.com': 'NVIDIA',
    // Guide / trade sources, for the lots whose price came from a corroborated round-up rather
    // than a single retail listing. The bare domain is honest but reads badly on a TV.
    'dutchbulbs.com': 'Dutch Bulbs',
    'containercompass.com': 'Container Compass',
    'vendsoft.com': 'VendSoft',
    'trolleymfg.com': 'Trolley Mfg',
    'fun-space.com': 'Fun Space',
    'topture.com': 'Topture',
    'zentrades.pro': 'ZenTrades',
    'usedvending.com': 'UsedVending',
    'alpacakeep.com': 'AlpacaKeep',
    'coingamesmachine.com': 'Coin Games Machine',
    'agproud.com': 'Ag Proud',
    'commercialtrucktrader.com': 'Commercial Truck Trader',
    'harpconnection.com': 'Harp Connection',
    'partingstone.com': 'Parting Stone',
    'nuwattenergy.com': 'NuWatt Energy',
    'homewyse.com': 'Homewyse',
    'macrumors.com': 'MacRumors',
    'modelfit.io': 'ModelFit',
    'videocardz.com': 'VideoCardz',
    'androidcentral.com': 'Android Central',
    'wellbuiltflorida.com': 'Well Built Florida',
    'affordabletool.com': 'Affordable Tool',
    'worldofwoodcraft.com': 'World of Woodcraft',
    'trick-tools.com': 'Trick-Tools',
};

function label(url) {
    try {
        const host = new URL(url).hostname.replace(/^(www|media|assets|blog|shop|store|cdn[\w-]*)\./, '');
        return HOSTS[host] || host;
    } catch { return 'source'; }
}

function loadLots() {
    const out = [];
    for (const rel of SOURCES) {
        const doc = JSON.parse(fs.readFileSync(path.join(ROOT, rel), 'utf8'));
        for (const l of doc.lots) {
            // Values arrive as 14.5 / 4084.85 / 0.5. Coin arithmetic in the game is integer and
            // bidding in cents is silly, so round to whole dollars. The $0.50 header set becomes
            // $1 and is still the cheapest lot in the auction.
            const value = Math.round(l.value);
            if (!(value > 0)) continue;                       // nothing free, nothing negative
            out.push({
                emoji: l.emoji,
                name: l.name,
                desc: l.desc,
                value,
                ...(l.imageUrl ? { img: l.imageUrl } : {}),
                src: label(l.url),
                on: l.capturedOn,
            });
        }
    }
    return out;
}

const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
const line = l => '    { emoji: ' + q(l.emoji) + ', name: ' + q(l.name) + ', desc: ' + q(l.desc) +
    ', value: ' + l.value + (l.img ? ', img: ' + q(l.img) : '') +
    ', src: ' + q(l.src) + ', on: ' + q(l.on) + ' },';

const lots = loadLots();
const banner = `// Real, purchasable items with verified prices — GENERATED, do not edit by hand.
// Source: ${SOURCES.join(' + ')}
// Regenerate: node scripts/build-goinggone-lots.js
const LOTS = [`;

const block = banner + '\n' + lots.map(line).join('\n') + '\n];';

const html = fs.readFileSync(TARGET, 'utf8');
const re = /(?:\/\/[^\n]*\n)*const LOTS = \[[\s\S]*?\n\];/;
if (!re.test(html)) {
    console.error('Could not find the LOTS block in goinggone.html — aborting rather than guessing.');
    process.exit(1);
}
fs.writeFileSync(TARGET, html.replace(re, block));

const bands = [[0, 100], [100, 1000], [1000, 5000], [5000, 10000], [10000, Infinity]];
console.log(`embedded ${lots.length} lots (${lots.filter(l => l.img).length} with photos)`);
for (const [lo, hi] of bands) {
    const n = lots.filter(l => l.value >= lo && l.value < hi).length;
    console.log(`  ${('$' + lo + (hi === Infinity ? '+' : '-' + hi)).padEnd(12)} ${n}`);
}
