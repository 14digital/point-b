/** Builds the API and the website for the single-server deployment (see server.js). */
const { execSync } = require('child_process');
const path = require('path');

const root = path.join(__dirname, '..');
const apiDir = path.join(root, 'point-b-api');
const webDir = path.join(root, 'point-b-mentors');
const dotenv = require(require.resolve('dotenv', { paths: [apiDir] }));
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(apiDir, '.env'), quiet: true });

// The site and the API share one domain, so the browser always calls /api on the same server: nothing to link.
const env = { ...process.env, NEXT_PUBLIC_API_URL: '/api' };
const run = (cmd, cwd) => { console.log(`\n> ${cmd}  (${path.basename(cwd)})`); execSync(cmd, { cwd, env, stdio: 'inherit' }); };

run('npx prisma generate', apiDir);
run('npx nest build', apiDir);
run('npx next build', webDir);
console.log('\nBuild complete. Start with: npm start');
