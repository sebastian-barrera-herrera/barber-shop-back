import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { AppModule } from './app.module';
import { setupApp } from './setup-app';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = setupApp(app);

  if (!config.isProduction || config.get('SWAGGER_ENABLED')) {
    const doc = new DocumentBuilder()
      .setTitle('Studio Booking API')
      .setDescription('Reservas para barberías, salones, spa y estudios de uñas.')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    SwaggerModule.setup('api/docs', app, SwaggerModule.createDocument(app, doc));
  }

  const port = config.get('PORT');
  await app.listen(port);
  Logger.log(`API lista en http://localhost:${port}/api/v1 · docs en /api/docs`, 'Bootstrap');
}

void bootstrap();
