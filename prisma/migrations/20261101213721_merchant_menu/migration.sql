-- CreateEnum
CREATE TYPE "menu_label" AS ENUM ('CARTA', 'MENU', 'SERVICES', 'PRODUCTS', 'PRICE_LIST');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "menu_label" "menu_label" NOT NULL DEFAULT 'CARTA';

-- CreateTable
CREATE TABLE "menu_categories" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "menu_items" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "category_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "price" INTEGER,
    "price_from" BOOLEAN NOT NULL DEFAULT false,
    "visible" BOOLEAN NOT NULL DEFAULT true,
    "position" INTEGER NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "menu_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "menu_categories_merchant_id_position_idx" ON "menu_categories"("merchant_id", "position");

-- CreateIndex
CREATE UNIQUE INDEX "menu_categories_id_merchant_id_key" ON "menu_categories"("id", "merchant_id");

-- CreateIndex
CREATE INDEX "menu_items_category_id_position_idx" ON "menu_items"("category_id", "position");

-- CreateIndex
CREATE INDEX "menu_items_merchant_id_idx" ON "menu_items"("merchant_id");

-- AddForeignKey
ALTER TABLE "menu_categories" ADD CONSTRAINT "menu_categories_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "menu_items" ADD CONSTRAINT "menu_items_category_id_merchant_id_fkey" FOREIGN KEY ("category_id", "merchant_id") REFERENCES "menu_categories"("id", "merchant_id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "menu_items"
  ADD CONSTRAINT "menu_items_price_check" CHECK ("price" > 0),
  ADD CONSTRAINT "menu_items_price_from_check"
    CHECK (NOT "price_from" OR "price" IS NOT NULL);

-- Solo desde el panel de su comercio; lo público se lee con resto_app_admin.
ALTER TABLE menu_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_categories FORCE ROW LEVEL SECURITY;
CREATE POLICY menu_categories_merchant ON menu_categories FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());

ALTER TABLE menu_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE menu_items FORCE ROW LEVEL SECURITY;
CREATE POLICY menu_items_merchant ON menu_items FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());
