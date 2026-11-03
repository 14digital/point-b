import 'dotenv/config';
import { Logger } from '@nestjs/common';
import { createApp } from './app-factory';

/** API on its own, for local development next to `next dev`. Production runs ../server.js instead. */
async function bootstrap() {
  const app = await createApp();
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API on :${port}  docs: /api/docs`);
}
bootstrap();
