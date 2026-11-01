import { randomUUID } from 'node:crypto';
import { setTimeout as sleep } from 'node:timers/promises';
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from './../src/app.module.js';
import { hashPassword } from './../src/common/passwords.js';
import type { MerchantStatus } from './../src/generated/prisma/client.js';
import {
  MAX_MENU_CATEGORIES,
  MAX_MENU_ITEMS,
} from './../src/modules/menu/menu-editor.js';
import { PrismaAdminService } from './../src/prisma/prisma-admin.service.js';
import { createClub, STAFF_PASSWORD } from './helpers/club.js';
import { LOCK_WAIT_MS, whileRowLocked } from './helpers/row-lock.js';
import { loginAdmin, loginStaff } from './helpers/sessions.js';

const ADMIN_PASSWORD = 'clave-de-admin';

type MenuBody = {
  label: string;
  categories: {
    id: string;
    name: string;
    visible: boolean;
    items: { id: string; name: string; visible: boolean }[];
  }[];
};

describe('Carta del comercio (e2e)', () => {
  let app: INestApplication<App>;
  let prisma: PrismaAdminService;
  let cafe: Awaited<ReturnType<typeof createClub>>;
  let owner: string;
  let employee: string;
  let admin: string;

  // Una app por test: el login tiene límite de intentos en memoria.
  beforeEach(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication({ logger: false });
    await app.init();
    prisma = moduleRef.get(PrismaAdminService);

    cafe = await createClub(prisma, 'cafe', [
      ['duena@cafe.com', 'OWNER'],
      ['empleado@cafe.com', 'EMPLOYEE'],
    ]);
    await prisma.platformAdmin.create({
      data: {
        email: 'admin@fullsync.com',
        name: 'Admin',
        passwordHash: await hashPassword(ADMIN_PASSWORD),
      },
    });
    owner = (await loginStaff(app, 'duena@cafe.com', STAFF_PASSWORD)).cookie;
    employee = (await loginStaff(app, 'empleado@cafe.com', STAFF_PASSWORD))
      .cookie;
    admin = await loginAdmin(app, 'admin@fullsync.com', ADMIN_PASSWORD);
  });

  afterEach(async () => {
    await app.close();
  });

  const send = (
    method: 'get' | 'post' | 'patch' | 'put' | 'delete',
    path: string,
    body?: object,
    cookie = owner,
  ) =>
    request(app.getHttpServer())[method](path).set('Cookie', cookie).send(body);
  const addCategory = async (name: string): Promise<MenuBody> =>
    (await send('post', '/panel/menu/categories', { name }).expect(201)).body;
  const addItem = async (categoryId: string, body: object): Promise<MenuBody> =>
    (
      await send(
        'post',
        `/panel/menu/categories/${categoryId}/items`,
        body,
      ).expect(201)
    ).body;
  // Una categoría "Cafetería" con ítems, y sus ids.
  const seedMenu = async (...names: string[]) => {
    const created = await addCategory('Cafetería');
    const categoryId = created.categories[0]!.id;
    let menu = created;
    for (const name of names) menu = await addItem(categoryId, { name });
    return { categoryId, itemIds: menu.categories[0]!.items.map((i) => i.id) };
  };
  const names = (menu: MenuBody) => menu.categories.map((c) => c.name);
  const itemNames = (menu: MenuBody, index = 0) =>
    menu.categories[index]!.items.map((i) => i.name);
  const auditOf = async (action: string) =>
    prisma.auditEvent.findMany({
      where: { action },
      orderBy: { createdAt: 'asc' },
    });
  const setStatus = (status: MerchantStatus) =>
    prisma.merchant.update({
      where: { id: cafe.merchantId },
      data: { status },
    });

  describe('dueño', () => {
    it('arranca vacía y con "Ver la carta"', async () => {
      const res = await send('get', '/panel/menu').expect(200);

      expect(res.body).toEqual({ label: 'CARTA', categories: [] });
    });

    it('carga categorías e ítems: lo nuevo va al final', async () => {
      await addCategory('Cafetería');
      const menu = await addCategory('Pastelería');
      const categoryId = menu.categories[0]!.id;

      await addItem(categoryId, { name: 'Café' });
      const res = await addItem(categoryId, {
        name: 'Tostado',
        description: ' De jamón y queso ',
        price: 4500,
        priceFrom: true,
        visible: false,
      });

      expect(names(res)).toEqual(['Cafetería', 'Pastelería']);
      expect(res.categories[0]!.items).toEqual([
        {
          id: expect.any(String),
          name: 'Café',
          description: null,
          price: null,
          priceFrom: false,
          visible: true,
        },
        {
          id: expect.any(String),
          name: 'Tostado',
          description: 'De jamón y queso',
          price: 4500,
          priceFrom: true,
          visible: false,
        },
      ]);
      expect(
        (await auditOf('menu_item.created')).map((e) => e.actorType),
      ).toEqual(['STAFF', 'STAFF']);
      expect(await auditOf('menu_category.created')).toHaveLength(2);
    });

    it('edita y oculta; sin cambios no audita', async () => {
      const { categoryId, itemIds } = await seedMenu('Café');
      const itemPath = `/panel/menu/items/${itemIds[0]}`;

      const res = await send('patch', itemPath, {
        name: 'Café doble',
        price: 3000,
      }).expect(200);
      await send('patch', itemPath, { name: 'Café doble' }).expect(200);
      await send('patch', `/panel/menu/categories/${categoryId}`, {
        visible: false,
      }).expect(200);

      expect(res.body.categories[0].items[0]).toMatchObject({
        name: 'Café doble',
        price: 3000,
      });
      expect(
        (await auditOf('menu_item.updated')).map((e) => e.payload),
      ).toEqual([
        {
          name: { from: 'Café', to: 'Café doble' },
          price: { from: null, to: 3000 },
        },
      ]);
      expect(
        (await auditOf('menu_category.updated')).map((e) => e.payload),
      ).toEqual([{ visible: { from: true, to: false } }]);
    });

    it('sube y baja categorías e ítems; en la punta no pasa nada', async () => {
      const { itemIds } = await seedMenu('A', 'B', 'C');
      const second = (await addCategory('Pastelería')).categories[1]!.id;

      const up = await send('post', `/panel/menu/items/${itemIds[2]}/move`, {
        direction: 'up',
      }).expect(200);
      expect(itemNames(up.body)).toEqual(['A', 'C', 'B']);
      const down = await send('post', `/panel/menu/items/${itemIds[0]}/move`, {
        direction: 'down',
      }).expect(200);
      expect(itemNames(down.body)).toEqual(['C', 'A', 'B']);
      const top = await send('post', `/panel/menu/items/${itemIds[2]}/move`, {
        direction: 'up',
      }).expect(200);
      expect(itemNames(top.body)).toEqual(['C', 'A', 'B']);
      expect(await auditOf('menu_item.moved')).toHaveLength(2);

      const category = await send(
        'post',
        `/panel/menu/categories/${second}/move`,
        { direction: 'up' },
      ).expect(200);
      expect(names(category.body)).toEqual(['Pastelería', 'Cafetería']);
      const edge = await send('post', `/panel/menu/categories/${second}/move`, {
        direction: 'up',
      }).expect(200);
      expect(names(edge.body)).toEqual(['Pastelería', 'Cafetería']);
      expect(await auditOf('menu_category.moved')).toHaveLength(1);
    });

    it('el orden se mantiene con huecos, después de borrar', async () => {
      const { itemIds } = await seedMenu('A', 'B', 'C');
      await send('delete', `/panel/menu/items/${itemIds[1]}`).expect(200);

      const res = await send('post', `/panel/menu/items/${itemIds[2]}/move`, {
        direction: 'up',
      }).expect(200);

      expect(itemNames(res.body)).toEqual(['C', 'A']);
    });

    it('borrar una categoría se lleva sus ítems', async () => {
      const { categoryId } = await seedMenu('Café', 'Té');

      const res = await send(
        'delete',
        `/panel/menu/categories/${categoryId}`,
      ).expect(200);

      expect(res.body.categories).toEqual([]);
      expect(await prisma.menuItem.count()).toBe(0);
      expect(
        (await auditOf('menu_category.deleted')).map((e) => e.payload),
      ).toEqual([{ name: 'Cafetería', items: 2 }]);
    });

    it('mueve un ítem a otra categoría, al final; a una de otro comercio no', async () => {
      const { itemIds } = await seedMenu('Café');
      const menu = await addCategory('Pastelería');
      const target = menu.categories[1]!.id;
      await addItem(target, { name: 'Medialuna' });

      const res = await send('patch', `/panel/menu/items/${itemIds[0]}`, {
        categoryId: target,
      }).expect(200);

      expect(itemNames(res.body, 0)).toEqual([]);
      expect(itemNames(res.body, 1)).toEqual(['Medialuna', 'Café']);

      const other = await createClub(prisma, 'heladeria', []);
      const foreign = await prisma.menuCategory.create({
        data: { merchantId: other.merchantId, name: 'Helados', position: 1 },
      });
      await send('patch', `/panel/menu/items/${itemIds[0]}`, {
        categoryId: foreign.id,
      }).expect(404);
    });

    it('sin precio no hay "desde": sacarlo lo saca, y pedirlo da error', async () => {
      const { categoryId, itemIds } = await seedMenu('Café');
      const path = `/panel/menu/items/${itemIds[0]}`;
      await send('patch', path, { price: 3000, priceFrom: true }).expect(200);

      const cleared = await send('patch', path, { price: null }).expect(200);
      expect(cleared.body.categories[0].items[0]).toMatchObject({
        price: null,
        priceFrom: false,
      });

      for (const res of [
        await send('patch', path, { priceFrom: true }),
        await send('post', `/panel/menu/categories/${categoryId}/items`, {
          name: 'Té',
          priceFrom: true,
        }),
      ]) {
        expect(res.status).toBe(400);
        expect(res.body.details.issues).toEqual([
          { path: 'priceFrom', message: expect.any(String) },
        ]);
      }
    });

    it('valida los datos', async () => {
      const { categoryId, itemIds } = await seedMenu('Café');
      const itemsPath = `/panel/menu/categories/${categoryId}/items`;

      for (const body of [
        { name: '  ' },
        { name: 'x'.repeat(81) },
        { name: 'Té', description: 'x'.repeat(301) },
        { name: 'Té', price: 0 },
        { name: 'Té', price: 10.5 },
        { name: 'Té', position: 1 },
        {},
      ]) {
        await send('post', itemsPath, body).expect(400);
      }
      await send('post', '/panel/menu/categories', {
        name: 'x'.repeat(81),
      }).expect(400);
      await send('put', '/panel/menu/label', { label: 'OTRO' }).expect(400);
      await send('post', `/panel/menu/items/${itemIds[0]}/move`, {
        direction: 'izquierda',
      }).expect(400);
      await send('patch', '/panel/menu/items/no-es-uuid', { name: 'X' }).expect(
        400,
      );
      await send('patch', `/panel/menu/items/${randomUUID()}`, {
        name: 'X',
      }).expect(404);
    });

    it('elige el nombre del botón de la lista fija, y se audita', async () => {
      const res = await send('put', '/panel/menu/label', {
        label: 'PRICE_LIST',
      }).expect(200);
      await send('put', '/panel/menu/label', { label: 'PRICE_LIST' }).expect(
        200,
      );

      expect(res.body.label).toBe('PRICE_LIST');
      expect(
        (await auditOf('menu.label_updated')).map((e) => e.payload),
      ).toEqual([{ from: 'CARTA', to: 'PRICE_LIST' }]);
    });

    it('el EMPLOYEE no entra; pausado o finalizado se ve pero no se edita', async () => {
      await send('get', '/panel/menu', undefined, employee).expect(403);
      await send(
        'post',
        '/panel/menu/categories',
        { name: 'X' },
        employee,
      ).expect(403);

      const { itemIds } = await seedMenu('Café');
      for (const status of ['PAUSED', 'ENDED'] as const) {
        await setStatus(status);
        await send('get', '/panel/menu').expect(200);
        const res = await send('patch', `/panel/menu/items/${itemIds[0]}`, {
          name: 'Otro',
        }).expect(409);
        expect(res.body.code).toBe('MERCHANT_READ_ONLY');
      }
    });
  });

  describe('límites', () => {
    const fillCategories = (count: number) =>
      prisma.menuCategory.createMany({
        data: Array.from({ length: count }, (_, i) => ({
          merchantId: cafe.merchantId,
          name: `Categoría ${i}`,
          position: i + 1,
        })),
      });

    it('hasta 30 categorías', async () => {
      await fillCategories(MAX_MENU_CATEGORIES - 1);

      await addCategory('La última');
      const res = await send('post', '/panel/menu/categories', {
        name: 'Una más',
      }).expect(409);

      expect(res.body).toMatchObject({
        code: 'MENU_LIMIT_REACHED',
        details: { kind: 'categories', limit: 30 },
      });
    });

    it('hasta 300 ítems por comercio, sumando todas las categorías', async () => {
      await fillCategories(2);
      const [first, second] = await prisma.menuCategory.findMany({
        orderBy: { position: 'asc' },
      });
      await prisma.menuItem.createMany({
        data: Array.from({ length: MAX_MENU_ITEMS - 1 }, (_, i) => ({
          merchantId: cafe.merchantId,
          categoryId: first!.id,
          name: `Ítem ${i}`,
          position: i + 1,
        })),
      });

      await addItem(second!.id, { name: 'El último' });
      const res = await send(
        'post',
        `/panel/menu/categories/${second!.id}/items`,
        { name: 'Uno más' },
      ).expect(409);

      expect(res.body).toMatchObject({
        code: 'MENU_LIMIT_REACHED',
        details: { kind: 'items', limit: 300 },
      });
    });

    it('espera el bloqueo del comercio: dos altas a la vez no pasan el límite', async () => {
      await fillCategories(MAX_MENU_CATEGORIES - 1);
      let pending: Promise<request.Response> | undefined;

      await whileRowLocked('merchants', cafe.merchantId, async (tx) => {
        pending = send('post', '/panel/menu/categories', {
          name: 'Mientras espera',
        }).then((res) => res);
        await sleep(LOCK_WAIT_MS);
        await tx.menuCategory.create({
          data: {
            merchantId: cafe.merchantId,
            name: 'La que entró antes',
            position: MAX_MENU_CATEGORIES,
          },
        });
      });

      const res = await pending!;
      expect(res.body.code).toBe('MENU_LIMIT_REACHED');
    });
  });

  describe('admin', () => {
    const adminPath = () => `/admin/merchants/${cafe.merchantId}/menu`;
    const asAdmin = (
      method: 'get' | 'post' | 'patch' | 'put' | 'delete',
      path: string,
      body?: object,
    ) => send(method, path, body, admin);

    it('edita lo mismo que el dueño, con su actor en la auditoría', async () => {
      const created = await asAdmin('post', `${adminPath()}/categories`, {
        name: 'Cafetería',
      }).expect(201);
      const categoryId = created.body.categories[0].id;
      const withItem = await asAdmin(
        'post',
        `${adminPath()}/categories/${categoryId}/items`,
        { name: 'Café', price: 2500 },
      ).expect(201);
      const itemId = withItem.body.categories[0].items[0].id;

      await asAdmin('patch', `${adminPath()}/items/${itemId}`, {
        visible: false,
      }).expect(200);
      await asAdmin('put', `${adminPath()}/label`, { label: 'MENU' }).expect(
        200,
      );
      const read = await asAdmin('get', adminPath()).expect(200);

      expect(read.body).toMatchObject({
        label: 'MENU',
        categories: [
          { name: 'Cafetería', items: [{ name: 'Café', visible: false }] },
        ],
      });
      expect(await auditOf('menu_category.created')).toMatchObject([
        { actorType: 'PLATFORM_ADMIN', merchantId: cafe.merchantId },
      ]);

      await asAdmin('delete', `${adminPath()}/items/${itemId}`).expect(200);
      await asAdmin('delete', `${adminPath()}/categories/${categoryId}`).expect(
        200,
      );
      expect(await prisma.menuCategory.count()).toBe(0);
    });

    it('edita con el club pausado o finalizado', async () => {
      for (const status of ['PAUSED', 'ENDED'] as const) {
        await setStatus(status);
        await asAdmin('post', `${adminPath()}/categories`, {
          name: status,
        }).expect(201);
      }
    });

    it('archivado se ve pero no se edita; inexistente da 404; sin sesión de admin no entra', async () => {
      await setStatus('ENDED');
      await asAdmin(
        'post',
        `/admin/merchants/${cafe.merchantId}/archive`,
      ).expect(200);

      await asAdmin('get', adminPath()).expect(200);
      const res = await asAdmin('post', `${adminPath()}/categories`, {
        name: 'X',
      }).expect(409);
      expect(res.body.code).toBe('MERCHANT_ARCHIVED');

      const missing = `/admin/merchants/${randomUUID()}/menu`;
      await asAdmin('get', missing).expect(404);
      await asAdmin('post', `${missing}/categories`, { name: 'X' }).expect(404);
      await send('get', adminPath(), undefined, owner).expect(401);
    });

    it('no toca la categoría de otro comercio', async () => {
      const other = await createClub(prisma, 'heladeria', []);
      const foreign = await prisma.menuCategory.create({
        data: { merchantId: other.merchantId, name: 'Helados', position: 1 },
      });

      await asAdmin('patch', `${adminPath()}/categories/${foreign.id}`, {
        name: 'Robada',
      }).expect(404);
      await asAdmin('post', `${adminPath()}/categories/${foreign.id}/items`, {
        name: 'X',
      }).expect(404);
    });
  });

  describe('pieza pública', () => {
    const find = async () =>
      (
        await request(app.getHttpServer())
          .get('/public/pieces/mostrador123')
          .expect(200)
      ).body;

    beforeEach(async () => {
      await prisma.piece.create({
        data: {
          merchantId: cafe.merchantId,
          publicCode: 'mostrador123',
          label: 'Mostrador',
        },
      });
    });

    it('sin ítems visibles no hay carta', async () => {
      expect((await find()).menu).toBeNull();

      const { itemIds } = await seedMenu('Café');
      await send('patch', `/panel/menu/items/${itemIds[0]}`, {
        visible: false,
      }).expect(200);
      expect((await find()).menu).toBeNull();
    });

    it('trae solo lo visible y en orden', async () => {
      const { categoryId, itemIds } = await seedMenu('Café', 'Oculto', 'Té');
      await send('patch', `/panel/menu/items/${itemIds[0]}`, {
        price: 2500,
        priceFrom: true,
      }).expect(200);
      await send('patch', `/panel/menu/items/${itemIds[1]}`, {
        visible: false,
      }).expect(200);
      await send('post', `/panel/menu/items/${itemIds[2]}/move`, {
        direction: 'up',
      }).expect(200);
      const hidden = (await addCategory('Oculta')).categories[1]!.id;
      await addItem(hidden, { name: 'No sale' });
      await send('patch', `/panel/menu/categories/${hidden}`, {
        visible: false,
      }).expect(200);
      await addCategory('Vacía');
      await send('put', '/panel/menu/label', { label: 'SERVICES' }).expect(200);

      expect((await find()).menu).toEqual({
        label: 'SERVICES',
        categories: [
          {
            id: categoryId,
            name: 'Cafetería',
            items: [
              {
                id: itemIds[0],
                name: 'Café',
                description: null,
                price: 2500,
                priceFrom: true,
              },
              {
                id: itemIds[2],
                name: 'Té',
                description: null,
                price: null,
                priceFrom: false,
              },
            ],
          },
        ],
      });
    });

    it('sale en cualquier estado del club, también en preparación', async () => {
      await seedMenu('Café');

      for (const status of ['DRAFT', 'PAUSED', 'ENDED'] as const) {
        await setStatus(status);
        const piece = await find();
        expect(piece.menu.categories[0].items[0].name).toBe('Café');
      }
    });

    it('un destino externo o una pieza inactiva no la traen', async () => {
      await seedMenu('Café');
      await prisma.piece.update({
        where: { publicCode: 'mostrador123' },
        data: { destination: 'INSTAGRAM', instagramUsername: 'cafe' },
      });
      expect(await find()).toEqual({
        state: 'REDIRECT',
        url: 'https://www.instagram.com/cafe/',
      });

      await prisma.piece.update({
        where: { publicCode: 'mostrador123' },
        data: { active: false },
      });
      expect(await find()).toEqual({ state: 'PIECE_INACTIVE' });
    });
  });
});
