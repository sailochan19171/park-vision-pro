#!/usr/bin/env node
/* eslint-disable */
// Rewrites src/constants/buildInfo.ts with today's date so the login screen
// shows the correct "Release Date" on every build. Invoked from npm scripts
// (android / start) and from the Gradle preBuild task.

const fs = require('fs');
const path = require('path');

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const d = new Date();
const dayName = DAYS[d.getDay()];
const dd = String(d.getDate()).padStart(2, '0');
const formatted = `${dayName}, ${dd} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;

const target = path.join(__dirname, '..', 'src', 'constants', 'buildInfo.ts');
const body = `// AUTO-GENERATED — do not edit by hand. The value below is rewritten by
// scripts/update-build-date.js on every \`npm run android\` / \`npm run start\`
// and by the Gradle \`updateBuildDate\` task on every native build.
export const BUILD_DATE = '${formatted}';
`;

fs.writeFileSync(target, body, 'utf8');
console.log(`[update-build-date] ${target} -> ${formatted}`);
