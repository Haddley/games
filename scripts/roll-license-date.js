#!/usr/bin/env node
// Rolls the Business Source License 1.1 "Change Date" forward to (today + ROLL_YEARS) — the
// rolling-license pattern BUSL is explicitly designed for: LICENSE itself says the license
// converts on "the Change Date, OR the fourth anniversary of first publication of THAT
// version, whichever comes first," and "the Change Date may vary for each version." Run on
// every push to main (.github/workflows/roll-license-date.yml) so the LATEST commit's terms
// always show ~4 years out while the project is actively maintained — but any past commit,
// frozen in git history, keeps whatever Change Date was baked in at the time. If the project
// ever goes quiet, the last commit's date stands and the final version converts on schedule.
//
// Only ever moves the date FORWARD. A human who deliberately sets an earlier date by hand
// (e.g. to actually ship the promised conversion early) is left alone — this script will not
// fight that decision, because newDate > current is required before it touches anything.
//
//   node scripts/roll-license-date.js

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const ROLL_YEARS = 4;

function targetDate() {
    const d = new Date();
    d.setUTCFullYear(d.getUTCFullYear() + ROLL_YEARS);
    return d.toISOString().slice(0, 10);
}

// Finds ONE date via `re` (which must capture exactly the YYYY-MM-DD as group 1) and bumps it
// forward in place, preserving everything else in the file byte-for-byte — critical for
// LICENSE, whose Parameters block is column-aligned, and which BSL's Covenants of Licensor
// (item 4) says must not be modified in any other way.
function bump(file, re, newDate) {
    const p = path.join(ROOT, file);
    const src = fs.readFileSync(p, 'utf8');
    const m = src.match(re);
    if (!m) { console.error(`${file}: pattern not found — refusing to guess`); process.exit(1); }
    const current = m[1];
    if (newDate <= current) {
        console.log(`${file}: ${current} is already >= ${newDate} — leaving it alone`);
        return false;
    }
    const out = src.slice(0, m.index) + m[0].replace(current, newDate) + src.slice(m.index + m[0].length);
    fs.writeFileSync(p, out);
    console.log(`${file}: ${current} -> ${newDate}`);
    return true;
}

const newDate = targetDate();
const changedLicense = bump('LICENSE', /Change Date:\s*(\d{4}-\d{2}-\d{2})/, newDate);
const changedFooter = bump('index.html', /converts to Apache 2\.0 on (\d{4}-\d{2}-\d{2})/, newDate);

process.exitCode = 0;   // whether anything changed is for the caller to check via `git diff`
if (!changedLicense && !changedFooter) console.log('Nothing to roll forward.');
