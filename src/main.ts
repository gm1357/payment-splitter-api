import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { SwaggerModule, DocumentBuilder } from '@nestjs/swagger';
import { CorsOptions } from '@nestjs/common/interfaces/external/cors-options.interface';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(new ValidationPipe());

  const config = new DocumentBuilder()
    .setTitle('Payment Splitter API')
    .setDescription('API for splitting payments between users')
    .setVersion('1.0')
    .addBearerAuth()
    .build();
  const documentFactory = () => SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('api', app, documentFactory);

  const corsOptions: CorsOptions = {
    origin: process.env.FRONTEND_URL,
    credentials: true,
  };

  if (process.env.NODE_ENV !== 'production') {
    corsOptions.origin = true;
  }

  app.enableCors(corsOptions);

  await app.listen(process.env.PORT ?? 3000);
}
void bootstrap();
