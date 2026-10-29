import 'dotenv/config';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import helmet from 'helmet';
import { AppModule } from './app.module';

async function bootstrap() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 24) throw new Error('JWT_SECRET must be set (24+ chars)');
  const app = await NestFactory.create(AppModule, { rawBody: true });
  app.use(helmet());
  app.setGlobalPrefix('api');
  app.enableCors({ origin: (process.env.CORS_ORIGIN ?? 'http://localhost:3000').split(','), credentials: true });
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  const doc = SwaggerModule.createDocument(app, new DocumentBuilder().setTitle('POINT B Mentors API').setVersion('1.0').addBearerAuth().build());
  SwaggerModule.setup('api/docs', app, doc);
  const port = Number(process.env.PORT ?? 4000);
  await app.listen(port);
  new Logger('Bootstrap').log(`API on :${port}  docs: /api/docs`);
}
bootstrap();
