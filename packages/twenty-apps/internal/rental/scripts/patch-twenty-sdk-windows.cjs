// Makes the installed twenty-sdk (2.43.0) write "/" instead of "\" in the paths it sends to the server.
// Without this, `twenty apply` on Windows fails with "Resource path must not contain backslashes".
// Safe to run more than once. Usage (from this folder, after installing dependencies):
//   node scripts/patch-twenty-sdk-windows.cjs
// See WINDOWS-APPLY.md for the full apply routine.
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'node_modules', 'twenty-sdk', 'dist', 'login-DkaZQzNc.js');

if (!fs.existsSync(file)) {
  console.error('Not found: ' + file + '\nRun the install first, and check the SDK version is 2.43.0.');
  process.exit(1);
}

const posix = (call) => `${call}.split(String.fromCharCode(92)).join(\`/\`)`;
let source = fs.readFileSync(file, 'utf8');
let changed = 0;

// Each spot: the path.relative(...) call, the text around it that makes it unique, and how often it occurs.
const spots = [
  { call: '(0,t.relative)(n,a)', before: 'd=', after: ';o.push(', count: 1 }, // manifest: logic function files
  { call: '(0,t.relative)(n,a)', before: 'c=', after: ',l={...i,componentName', count: 1 }, // manifest: front component files
  { call: 't.default.relative(i,c)', before: 'd=', after: ',', count: 1 }, // built files
  { call: 't.default.relative(i,f)', before: 'p=', after: ',', count: 1 }, // built files (entry point)
  { call: '(0,t.relative)(e.o,n)', before: '', after: '', count: 3 }, // upload step
];

for (const { call, before, after, count } of spots) {
  const original = before + call + after;
  const occurrences = (text) => source.split(text).length - 1;
  // Already done (by this script, or by hand with .replace(...)): the call is followed by .split( / .replace(.
  const patched = occurrences(before + call + '.split(') + occurrences(before + call + '.replace(');
  const untouched = occurrences(original) - patched;

  if (patched === count && untouched <= 0) continue;
  if (untouched === count && patched === 0) {
    source = source.split(original).join(before + posix(call) + after);
    changed += 1;
    continue;
  }
  console.error(`Unexpected SDK file near "${original}": ${untouched} untouched and ${patched} patched, expected ${count} in total. Is it version 2.43.0?`);
  process.exit(1);
}

if (changed) fs.writeFileSync(file, source);
console.log(changed ? `Patched ${changed} spot(s) in twenty-sdk.` : 'twenty-sdk was already patched.');
