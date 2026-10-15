import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { apiErrorSchema } from './errors/api-error.schema.js';

export function createOpenApiDocument(app: INestApplication) {
  const config = new DocumentBuilder()
    .setTitle('FullSync Club API')
    .setVersion('0.1')
    .addGlobalResponse({
      status: 'default',
      description: 'Error',
      standardSchema: apiErrorSchema,
    })
    .build();
  return SwaggerModule.createDocument(app, config);
}

export function setupOpenApi(app: INestApplication) {
  SwaggerModule.setup('docs', app, () => createOpenApiDocument(app), {
    jsonDocumentUrl: 'docs/json',
  });
}
