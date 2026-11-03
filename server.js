/**
 * Production entry point: one Node.js server for the whole product.
 *   /api/...       -> NestJS API   (point-b-api)
 *   everything else -> Next.js site (point-b-mentors)
 * Build first with `npm run build`, then `npm start`. On cPanel, set this file as the application startup file.
 */
const path = require('path');

const root = __dirname;
const apiDir = path.join(root, 'point-b-api');
const webDir = path.join(root, 'point-b-mentors');
const fromApi = (m) => require(require.resolve(m, { paths: [apiDir] }));
const fromWeb = (m) => require(require.resolve(m, { paths: [webDir] }));

// One .env at the project root; point-b-api/.env is still read for anything not set there. Real env vars always win.
const dotenv = fromApi('dotenv');
dotenv.config({ path: path.join(root, '.env'), quiet: true });
dotenv.config({ path: path.join(apiDir, '.env'), quiet: true });
process.env.NODE_ENV = 'production';

// The API's enums come from the generated Prisma Client. If the host reinstalled node_modules after the build
// (some Docker/Railpack images do), that client is an empty stub and the API crashes on boot, so regenerate it.
// Checked in a child process so this process never caches the stub.
const { execFileSync, execSync } = require('child_process');
const prismaReady = () => {
  try { execFileSync(process.execPath, ['-e', "process.exit(require('@prisma/client').ApplicationStatus ? 0 : 1)"], { cwd: apiDir, stdio: 'ignore' }); return true; } catch { return false; }
};
function ensurePrismaClient() {
  if (prismaReady()) return;
  console.log('Prisma Client not generated, running prisma generate...');
  execSync('npx prisma generate', { cwd: apiDir, stdio: 'inherit' });
  if (!prismaReady()) throw new Error('Prisma Client is still missing after prisma generate');
}

async function main() {
  ensurePrismaClient();
  const next = fromWeb('next');
  const web = next({ dev: false, dir: webDir });
  await web.prepare();
  const handle = web.getRequestHandler();

  const { createApp } = require(path.join(apiDir, 'dist', 'app-factory.js'));
  const app = await createApp((req, res) => handle(req, res));
  const port = Number(process.env.PORT || 3000);
  await app.listen(port);
  console.log(`POINT B running on port ${port}: website at /, API at /api`);
}

main().catch((e) => { console.error(e); process.exit(1); });
