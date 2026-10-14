#!/bin/bash
# Solo desarrollo: crea los roles y las bases la primera vez que arranca el volumen.
#   resto_migrator  dueño de las tablas, lo usa `prisma migrate` (ignora RLS)
#   resto_app       runtime de la API, sujeto a RLS
#   resto_app_admin endpoints /admin y lectura pública de piezas (BYPASSRLS)
set -euo pipefail

psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" <<-EOSQL
	CREATE ROLE resto_migrator LOGIN CREATEDB PASSWORD 'migrator';
	CREATE ROLE resto_app LOGIN PASSWORD 'app';
	CREATE ROLE resto_app_admin LOGIN BYPASSRLS PASSWORD 'app_admin';
	CREATE DATABASE resto_club OWNER resto_migrator;
	CREATE DATABASE resto_club_test OWNER resto_migrator;
EOSQL

for db in resto_club resto_club_test; do
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$db" <<-EOSQL
	REVOKE ALL ON DATABASE $db FROM PUBLIC;
	GRANT CONNECT ON DATABASE $db TO resto_app, resto_app_admin;
	GRANT USAGE ON SCHEMA public TO resto_app, resto_app_admin;
	ALTER DEFAULT PRIVILEGES FOR ROLE resto_migrator IN SCHEMA public
	  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO resto_app, resto_app_admin;
	ALTER DEFAULT PRIVILEGES FOR ROLE resto_migrator IN SCHEMA public
	  GRANT USAGE, SELECT ON SEQUENCES TO resto_app, resto_app_admin;
EOSQL
done
