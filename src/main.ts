import 'dotenv/config';
import 'reflect-metadata';
import * as fs from 'fs';
import * as path from 'path';
import { Logger, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { ENV } from './common/utils';

process.env.TZ = process.env.TZ || 'Asia/Kolkata';
const log = new Logger('Nerkanal');

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    logger: ['log', 'warn', 'error'],
  });

  app.enableCors();
  app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: false }));

  fs.mkdirSync('uploads', { recursive: true });
  fs.mkdirSync('public', { recursive: true });

  app.useStaticAssets(path.resolve('uploads'), { prefix: '/files/' });
  app.useStaticAssets(path.resolve('public'));

  const doc = SwaggerModule.createDocument(
    app,
    new DocumentBuilder()
      .setTitle('Nerkanal API')
      .setDescription('HRMS + ATS + Candidate Portal — 15 modules + Jarvis')
      .setVersion('1.0')
      .addBearerAuth()
      .build(),
  );
  SwaggerModule.setup('docs', app, doc, {
    customSiteTitle: 'Nerkanal API',
    swaggerOptions: { persistAuthorization: true },
  });

  const port = +ENV('PORT', '3000');
  await app.listen(port, '0.0.0.0');
  log.log(`Nerkanal running on http://localhost:${port}  (API console: /docs)`);
}

bootstrap();
