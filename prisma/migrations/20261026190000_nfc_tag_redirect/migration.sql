-- CreateEnum
CREATE TYPE "piece_destination_type" AS ENUM ('CLUBSY', 'GOOGLE_REVIEWS', 'WHATSAPP', 'OTHER');

-- CreateEnum
CREATE TYPE "nfc_chip_type" AS ENUM ('NTAG213', 'NTAG215', 'NTAG216');

-- CreateEnum
CREATE TYPE "piece_fulfillment_status" AS ENUM ('PENDING', 'PROGRAMMED', 'DELIVERED', 'REPLACED');

-- CreateEnum
CREATE TYPE "sale_payment_status" AS ENUM ('PENDING', 'PAID', 'PARTIAL', 'CANCELED');

-- AlterTable
ALTER TABLE "merchants" ADD COLUMN     "contact_email" TEXT,
ADD COLUMN     "contact_name" TEXT,
ADD COLUMN     "contact_phone" TEXT,
ADD COLUMN     "next_action_at" TIMESTAMPTZ(3),
ADD COLUMN     "sales_notes" TEXT;

-- AlterTable
ALTER TABLE "pieces" ADD COLUMN     "delivered_at" TIMESTAMPTZ(3),
ADD COLUMN     "destination_type" "piece_destination_type" NOT NULL DEFAULT 'CLUBSY',
ADD COLUMN     "destination_url" TEXT,
ADD COLUMN     "fulfillment_status" "piece_fulfillment_status" NOT NULL DEFAULT 'DELIVERED',
ADD COLUMN     "nfc_chip_type" "nfc_chip_type" NOT NULL DEFAULT 'NTAG215',
ADD COLUMN     "nfc_password_encrypted" TEXT,
ADD COLUMN     "programmed_at" TIMESTAMPTZ(3),
ADD COLUMN     "replaces_piece_id" UUID,
ADD COLUMN     "sale_id" UUID;

-- CreateTable
CREATE TABLE "sales" (
    "id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "product" TEXT NOT NULL,
    "tag_count" INTEGER NOT NULL DEFAULT 1,
    "amount" DECIMAL(12,2),
    "payment_method" TEXT,
    "payment_status" "sale_payment_status" NOT NULL DEFAULT 'PENDING',
    "sold_by_admin_id" UUID,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "sales_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "piece_scans" (
    "id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "user_agent" TEXT,
    "referer" TEXT,
    "ip_hash" TEXT,
    "possible_bot" BOOLEAN NOT NULL DEFAULT false,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "sales_merchant_id_idx" ON "sales"("merchant_id");

-- CreateIndex
CREATE INDEX "piece_scans_piece_id_created_at_idx" ON "piece_scans"("piece_id", "created_at");

-- CreateIndex
CREATE INDEX "piece_scans_merchant_id_created_at_idx" ON "piece_scans"("merchant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "pieces_replaces_piece_id_key" ON "pieces"("replaces_piece_id");

-- CreateIndex
CREATE INDEX "pieces_sale_id_idx" ON "pieces"("sale_id");

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_sale_id_fkey" FOREIGN KEY ("sale_id") REFERENCES "sales"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_replaces_piece_id_fkey" FOREIGN KEY ("replaces_piece_id") REFERENCES "pieces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sales" ADD CONSTRAINT "sales_sold_by_admin_id_fkey" FOREIGN KEY ("sold_by_admin_id") REFERENCES "platform_admins"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_scans" ADD CONSTRAINT "piece_scans_piece_id_merchant_id_fkey" FOREIGN KEY ("piece_id", "merchant_id") REFERENCES "pieces"("id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_scans" ADD CONSTRAINT "piece_scans_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- CHECK a mano (Prisma no los ve, ver CLAUDE.md): CLUBSY nunca lleva destino
-- propio; cualquier otro tipo lo exige. Evita un redirect con URL vacía.
ALTER TABLE "pieces" ADD CONSTRAINT "pieces_destination_url_required_check" CHECK (
  (destination_type = 'CLUBSY' AND destination_url IS NULL) OR
  (destination_type <> 'CLUBSY' AND destination_url IS NOT NULL)
);

-- RLS a mano (ver migración `rls`): sales y piece_scans son por comercio.
-- Ninguna es pública: /public/pieces escribe piece_scans con
-- PrismaAdminService (bypass) y /admin lee las dos igual, sin contexto.
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "sales" FORCE ROW LEVEL SECURITY;
CREATE POLICY sales_merchant ON "sales" FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());

ALTER TABLE "piece_scans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "piece_scans" FORCE ROW LEVEL SECURITY;
CREATE POLICY piece_scans_merchant ON "piece_scans" FOR ALL
  USING (merchant_id = app_merchant_id())
  WITH CHECK (merchant_id = app_merchant_id());
