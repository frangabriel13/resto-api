-- CreateTable
CREATE TABLE "piece_nfc_passwords" (
    "piece_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "encrypted" TEXT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "piece_nfc_passwords_pkey" PRIMARY KEY ("piece_id")
);

-- CreateIndex
CREATE UNIQUE INDEX "piece_nfc_passwords_piece_id_merchant_id_key" ON "piece_nfc_passwords"("piece_id", "merchant_id");

-- AddForeignKey
ALTER TABLE "piece_nfc_passwords" ADD CONSTRAINT "piece_nfc_passwords_piece_id_merchant_id_fkey" FOREIGN KEY ("piece_id", "merchant_id") REFERENCES "pieces"("id", "merchant_id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Solo para resto_app_admin, igual que merchant_profiles. Además sin UPDATE:
-- la contraseña es fija (el seed sí borra la de la demo al recrearla).
REVOKE ALL ON "piece_nfc_passwords" FROM resto_app;
REVOKE UPDATE ON "piece_nfc_passwords" FROM resto_app_admin;
ALTER TABLE "piece_nfc_passwords" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "piece_nfc_passwords" FORCE ROW LEVEL SECURITY;
