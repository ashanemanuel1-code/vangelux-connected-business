// Upload safety check — runs automatically before every build on GitHub.
// If the files in this repository are not the VANGELUX business app (for example the
// landing page's index.html was uploaded here by mistake), the build stops, nothing is
// published, and the last working version stays live.
import { existsSync, readFileSync } from 'node:fs';

const problems = [];
const must = ['index.html', 'package.json', 'vite.config.ts', 'src/main.tsx', 'src/App.tsx'];
for (const f of must) if (!existsSync(f)) problems.push(`The file "${f}" is missing.`);

if (existsSync('index.html')) {
  const html = readFileSync('index.html', 'utf8');
  if (!html.includes('/src/main.tsx') || !html.includes('id="root"')) {
    problems.push('"index.html" is not the business app\'s index.html (it may be the landing page\'s). Upload the business app\'s index.html again.');
  }
  if (html.includes('vangelux-landing-page')) problems.push('"index.html" is the LANDING PAGE file. It belongs in the vangelux-landing-page repository.');
}
for (const stray of ['script.js', 'style.css']) {
  if (existsSync(stray)) problems.push(`"${stray}" belongs to the landing page, not this app. Delete it from this repository.`);
}

if (problems.length) {
  console.error('\n================ UPLOAD SAFETY CHECK FAILED ================');
  console.error('Nothing was published — your live app is still the last working version.\n');
  problems.forEach((p) => console.error(' • ' + p));
  console.error('\nFix the files above (or ask Claude), then upload again.');
  console.error('============================================================\n');
  process.exit(1);
}
console.log('Upload safety check passed ✓');
