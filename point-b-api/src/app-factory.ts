import { ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import type { IncomingMessage, ServerResponse } from 'http';
import helmet from 'helmet';
import { AppModule } from './app.module';

type Handler = (req: IncomingMessage, res: ServerResponse) => unknown;

/**
 * Builds the API. With `web`, the same server also serves the website: every request outside /api goes to the
 * Next.js handler, so the whole product runs as one process on one domain.
 */
export async function createApp(web?: Handler) {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) throw new Error('JWT_SECRET must be set (24+ chars)');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { rawBody: true });
  // Registered before Nest's body parsers, so Next.js receives requests untouched.
  if (web) app.use((req: IncomingMessage & { path?: string }, res: ServerResponse, next: () => void) => ((req.url ?? '/').startsWith('/api') ? next() : web(req, res)));
  app.use('/api', helmet());
  // Room for an uploaded QR code image in admin settings; everything else is far smaller.
  app.useBodyParser('json', { limit: '3mb' });
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('POINT B Mentors API').setVersion('1.0').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc);
  return app;
}
