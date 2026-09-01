import { NestFactory } from '@nestjs/core';
import { RequestMethod, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

import { AppModule } from './app.module';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const config = app.get(ConfigService);

  app.setGlobalPrefix('v1', {
    exclude: [{ path: 'assets/{*path}', method: RequestMethod.GET }],
  });
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.useGlobalFilters(new HttpExceptionFilter());

  // 에러의 원인은 다음과 같습니다:
  // 1. config.get<string>()에 4개의 인자를 넘겼는데, ConfigService.get의 시그니처는 (propertyPath: string, defaultValue?: T)로 최소 1개, 최대 2개 인자만 허용합니다.
  // 2. .split(',') 호출 시, config.get의 반환값이 undefined일 수 있는데, undefined에는 split 메서드가 없습니다.
  // 3. map((o) => o.trim())의 o 타입이 any이므로 암시적 any 타입 오류가 발생합니다.

  // 올바른 예시(기본값을 하나의 문자열로 전달하고, 반환값이 없을 경우를 처리):
  const corsOriginsRaw =
    config.get<string>('CORS_ORIGINS', 'http://localhost:5173,http://localhost:5174,http://localhost:5175') || '';
  const corsOrigins = corsOriginsRaw
    .split(',')
    .map((o: string) => o.trim())
    .filter((o) => Boolean(o));

  app.enableCors({
    origin: corsOrigins,
    credentials: true,
  });

  const swaggerConfig = new DocumentBuilder()
    .setTitle('brit-api')
    .setDescription('Brit NestJS API')
    .setVersion('0.1')
    .addBearerAuth()
    .build();
  const document = SwaggerModule.createDocument(app, swaggerConfig);
  SwaggerModule.setup('docs', app, document, {
    useGlobalPrefix: false,
  });

  const port = config.get<number>('PORT', 3000);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`brit-api listening on http://localhost:${port}/v1`);
  // eslint-disable-next-line no-console
  console.log(`swagger: http://localhost:${port}/docs`);
}

void bootstrap();
