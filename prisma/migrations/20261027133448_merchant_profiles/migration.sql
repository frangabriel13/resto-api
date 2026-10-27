-- CreateTable
CREATE TABLE "merchant_profiles" (
    "merchant_id" UUID NOT NULL,
    "contact_name" TEXT,
    "contact_phone_e164" TEXT,
    "address" TEXT,
    "google_rating_initial" DECIMAL(2,1),
    "google_reviews_initial" INTEGER,
    "google_data_taken_on" DATE,
    "notes" TEXT,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "merchant_profiles_pkey" PRIMARY KEY ("merchant_id")
);

-- AddForeignKey
ALTER TABLE "merchant_profiles" ADD CONSTRAINT "merchant_profiles_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "merchant_profiles"
  ADD CONSTRAINT "merchant_profiles_google_rating_initial_check"
    CHECK ("google_rating_initial" BETWEEN 1.0 AND 5.0),
  ADD CONSTRAINT "merchant_profiles_google_reviews_initial_check"
    CHECK ("google_reviews_initial" >= 0),
  -- La fecha es la de la puntuación y las reseñas: va si hay alguna de las dos.
  ADD CONSTRAINT "merchant_profiles_google_data_taken_on_check"
    CHECK (("google_data_taken_on" IS NULL) =
           ("google_rating_initial" IS NULL AND "google_reviews_initial" IS NULL));

-- Solo para el admin (resto_app_admin, BYPASSRLS). Para resto_app queda cerrada
-- dos veces: sin permisos, para que un acceso por error falle en vez de
-- devolver vacío, y con RLS sin políticas por si alguien le devuelve los permisos.
REVOKE ALL ON "merchant_profiles" FROM resto_app;
ALTER TABLE "merchant_profiles" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "merchant_profiles" FORCE ROW LEVEL SECURITY;
