-- CreateEnum
CREATE TYPE "piece_destination" AS ENUM ('CLUB', 'GOOGLE_REVIEWS', 'INSTAGRAM', 'WHATSAPP');

-- AlterTable
ALTER TABLE "pieces" ADD COLUMN     "destination" "piece_destination" NOT NULL DEFAULT 'CLUB',
ADD COLUMN     "google_review_url" TEXT,
ADD COLUMN     "instagram_username" TEXT,
ADD COLUMN     "whatsapp_message" TEXT,
ADD COLUMN     "whatsapp_phone_e164" TEXT;

-- CreateTable
CREATE TABLE "piece_scans" (
    "id" UUID NOT NULL,
    "piece_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "destination" "piece_destination" NOT NULL,
    "scanned_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_scans_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "piece_scans_piece_id_scanned_at_idx" ON "piece_scans"("piece_id", "scanned_at");

-- CreateIndex
CREATE INDEX "piece_scans_merchant_id_scanned_at_idx" ON "piece_scans"("merchant_id", "scanned_at");

-- AddForeignKey
ALTER TABLE "piece_scans" ADD CONSTRAINT "piece_scans_piece_id_merchant_id_fkey" FOREIGN KEY ("piece_id", "merchant_id") REFERENCES "pieces"("id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "piece_scans" ADD CONSTRAINT "piece_scans_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Cada destino tiene su campo obligatorio y los de los otros destinos vacíos.
ALTER TABLE "pieces"
  ADD CONSTRAINT "pieces_destination_fields_check" CHECK (
    ("google_review_url" IS NOT NULL) = ("destination" = 'GOOGLE_REVIEWS')
    AND ("instagram_username" IS NOT NULL) = ("destination" = 'INSTAGRAM')
    AND ("whatsapp_phone_e164" IS NOT NULL) = ("destination" = 'WHATSAPP')
    AND ("whatsapp_message" IS NULL OR "destination" = 'WHATSAPP')
  );

-- Solo para resto_app_admin, igual que merchant_profiles: sin permisos para
-- resto_app y con RLS sin políticas.
REVOKE ALL ON "piece_scans" FROM resto_app;
ALTER TABLE "piece_scans" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "piece_scans" FORCE ROW LEVEL SECURITY;
