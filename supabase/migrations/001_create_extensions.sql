-- Migration 001: Enable required PostgreSQL extensions
-- Registro Urbanístico España

CREATE EXTENSION IF NOT EXISTS "postgis" WITH SCHEMA "public";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "public";
