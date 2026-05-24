-- ============================================================
-- AgroMaíz — schema.sql
-- Ejecutar en pgAdmin: Database db_agromaiz → Query Tool → Run
-- ============================================================

-- Habilitar extensión para UUIDs (viene incluida en PostgreSQL)
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ──────────────────────────────────────────────────────────
-- TABLA: usuarios
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS usuarios (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre        VARCHAR(120)  NOT NULL,
    email         VARCHAR(255)  NOT NULL UNIQUE,
    password_hash VARCHAR(255)  NOT NULL,
    rol           VARCHAR(20)   NOT NULL DEFAULT 'agricultor',
                                -- valores posibles: 'agricultor', 'agronomo', 'admin'
    activo        BOOLEAN       NOT NULL DEFAULT true,
    creado_en     TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

-- Índice para búsquedas por email (login)
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON usuarios(email);


-- ──────────────────────────────────────────────────────────
-- TABLA: refresh_tokens
-- Guarda los tokens de refresco para invalidar sesiones
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refresh_tokens (
    id            UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id    UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    token_hash    VARCHAR(255)  NOT NULL UNIQUE,
    expira_en     TIMESTAMPTZ   NOT NULL,
    creado_en     TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_refresh_tokens_usuario ON refresh_tokens(usuario_id);


-- ──────────────────────────────────────────────────────────
-- TABLA: cultivos
-- Registro principal del cultivo del agricultor
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS cultivos (
    id              UUID          PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id      UUID          NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    departamento    VARCHAR(100),
    municipio       VARCHAR(100),    -- nombre del municipio o vereda
    latitud         DECIMAL(10,7),
    longitud        DECIMAL(10,7),
    fecha_siembra   DATE          NOT NULL,
    tipo_suelo      VARCHAR(20)   CHECK (tipo_suelo IN ('arenoso', 'limoso', 'arcilloso')),
    ph_suelo        VARCHAR(20)   CHECK (ph_suelo IN ('acido', 'lig_acido', 'neutro', 'lig_alca', 'alca')),
    tiene_analisis  BOOLEAN       DEFAULT false,
    tipo_manejo     VARCHAR(10)   CHECK (tipo_manejo IN ('lluvia', 'riego')),
    activo          BOOLEAN       NOT NULL DEFAULT true,
    creado_en       TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    actualizado_en  TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_cultivos_usuario ON cultivos(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cultivos_activo  ON cultivos(usuario_id, activo);


-- ──────────────────────────────────────────────────────────
-- FUNCIÓN: actualizar_timestamp()
-- Actualiza automáticamente el campo actualizado_en
-- ──────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION actualizar_timestamp()
RETURNS TRIGGER AS $$
BEGIN
    NEW.actualizado_en = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Aplicar trigger a las tablas que lo necesitan
CREATE TRIGGER trg_usuarios_updated
    BEFORE UPDATE ON usuarios
    FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();

CREATE TRIGGER trg_cultivos_updated
    BEFORE UPDATE ON cultivos
    FOR EACH ROW EXECUTE FUNCTION actualizar_timestamp();


-- ──────────────────────────────────────────────────────────
-- DATOS DE PRUEBA (opcional — borrar en producción)
-- Contraseña para ambos usuarios: Test1234!
-- ──────────────────────────────────────────────────────────
INSERT INTO usuarios (nombre, email, password_hash, rol) VALUES (
    'Productor Demo',
    'demo@agromaiz.co',
    '$2a$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewdBPj4J/HS.iWQ2',
    'agricultor'
) ON CONFLICT (email) DO NOTHING;
-- ──────────────────────────────────────────────────────────
-- TABLA: conversaciones
-- Historial del chat con AgroBot por usuario
-- ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS conversaciones (
    id          UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
    usuario_id  UUID        NOT NULL REFERENCES usuarios(id) ON DELETE CASCADE,
    rol         VARCHAR(10) NOT NULL CHECK (rol IN ('user', 'assistant')),
    contenido   TEXT        NOT NULL,
    creado_en   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversaciones_usuario ON conversaciones(usuario_id, creado_en DESC);
