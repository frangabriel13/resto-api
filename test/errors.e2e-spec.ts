import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  INestApplication,
  Post,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { AppModule } from './../src/app.module.js';
import { AppException } from './../src/common/errors/app.exception.js';
import { createOpenApiDocument } from './../src/common/openapi.js';

const createThingSchema = z
  .object({
    name: z.string().min(2),
    contact: z.object({ phone: z.string() }),
  })
  .meta({ id: 'CreateThingBody' });

@Controller('test-errors')
class TestErrorsController {
  @Post('validation')
  validation(
    @Body({ schema: createThingSchema })
    body: z.infer<typeof createThingSchema>,
  ) {
    return body;
  }

  @Get('app')
  app() {
    throw new AppException('CONFLICT', 'Ya existe.', { id: 'abc' });
  }

  @Get('nest')
  nest() {
    throw new ForbiddenException('Forbidden resource');
  }

  @Get('crash')
  crash() {
    throw new Error('detalle interno secreto');
  }
}

describe('Formato de errores y OpenAPI (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestErrorsController],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('valida el body, descarta campos de más y responde los datos parseados', async () => {
    const res = await request(app.getHttpServer())
      .post('/test-errors/validation')
      .send({ name: 'Ana', contact: { phone: '11' }, extra: true })
      .expect(201);
    expect(res.body).toEqual({ name: 'Ana', contact: { phone: '11' } });
  });

  it('responde VALIDATION_ERROR con la lista de problemas', async () => {
    const res = await request(app.getHttpServer())
      .post('/test-errors/validation')
      .send({ name: 'A', contact: {} })
      .expect(400);
    expect(res.body).toMatchObject({
      statusCode: 400,
      code: 'VALIDATION_ERROR',
      message: 'Los datos enviados no son válidos.',
    });
    const paths = res.body.details.issues.map((i: { path: string }) => i.path);
    expect(paths).toEqual(['name', 'contact.phone']);
  });

  it('responde un AppException con su código, mensaje y detalles', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-errors/app')
      .expect(409);
    expect(res.body).toEqual({
      statusCode: 409,
      code: 'CONFLICT',
      message: 'Ya existe.',
      details: { id: 'abc' },
    });
  });

  it('mapea las excepciones de Nest a un código genérico en español', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-errors/nest')
      .expect(403);
    expect(res.body).toEqual({
      statusCode: 403,
      code: 'FORBIDDEN',
      message: 'No tenés permiso para hacer esto.',
    });
  });

  it('responde NOT_FOUND para una ruta inexistente', async () => {
    const res = await request(app.getHttpServer())
      .get('/no-existe')
      .expect(404);
    expect(res.body.code).toBe('NOT_FOUND');
  });

  it('responde BAD_REQUEST para un JSON mal formado', async () => {
    const res = await request(app.getHttpServer())
      .post('/test-errors/validation')
      .set('Content-Type', 'application/json')
      .send('{"name":')
      .expect(400);
    expect(res.body.code).toBe('BAD_REQUEST');
  });

  it('no expone detalles de un error inesperado', async () => {
    const res = await request(app.getHttpServer())
      .get('/test-errors/crash')
      .expect(500);
    expect(res.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: 'Ocurrió un error inesperado.',
    });
    expect(JSON.stringify(res.body)).not.toContain('secreto');
  });

  it('publica los schemas de zod y el ApiError en el OpenAPI', () => {
    const doc = createOpenApiDocument(app);
    const operation = doc.paths['/test-errors/validation']?.post;
    expect(operation?.requestBody).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/CreateThingBody' },
        },
      },
    });
    expect(operation?.responses.default).toMatchObject({
      content: {
        'application/json': {
          schema: { $ref: '#/components/schemas/ApiError' },
        },
      },
    });
    expect(doc.components?.schemas?.ApiError).toMatchObject({
      required: ['statusCode', 'code', 'message'],
    });
  });
});
