import { Controller, Get, INestApplication, Query } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { z } from 'zod';
import { AppModule } from './../src/app.module.js';
import { AppException } from './../src/common/errors/app.exception.js';
import { ErrorReporter } from './../src/common/errors/error-reporter.js';

@Controller('test-errors')
class TestErrorsController {
  @Get('unexpected')
  unexpected() {
    throw new Error('se rompió algo');
  }

  @Get('expected')
  expected() {
    throw new AppException('COOLDOWN_ACTIVE');
  }

  @Get('validation')
  validation(@Query('n', { schema: z.coerce.number() }) n: number) {
    return { n };
  }
}

describe('Reporte de errores a Sentry (e2e)', () => {
  let app: INestApplication<App>;
  const reported: unknown[] = [];

  beforeEach(async () => {
    reported.length = 0;
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
      controllers: [TestErrorsController],
    })
      .overrideProvider(ErrorReporter)
      .useValue({ report: (error: unknown) => reported.push(error) })
      .compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const get = (path: string) => request(app.getHttpServer()).get(path);

  it('un error inesperado responde INTERNAL_ERROR y se reporta una vez', async () => {
    const res = await get('/test-errors/unexpected').expect(500);

    expect(res.body).toEqual({
      statusCode: 500,
      code: 'INTERNAL_ERROR',
      message: expect.any(String),
    });
    expect(reported).toHaveLength(1);
    expect((reported[0] as Error).message).toBe('se rompió algo');
  });

  it('los errores esperados y de validación no se reportan', async () => {
    await get('/test-errors/expected').expect(409);
    await get('/test-errors/validation?n=abc').expect(400);
    await get('/ruta-que-no-existe').expect(404);

    expect(reported).toHaveLength(0);
  });
});
