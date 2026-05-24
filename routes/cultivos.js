// ============================================================
// AgroMaíz — routes/cultivos.js
// CRUD del cultivo del agricultor autenticado
//
// GET    /api/cultivos          → cultivo activo del usuario
// POST   /api/cultivos          → registrar nuevo cultivo
// PUT    /api/cultivos/:id      → actualizar cultivo
// DELETE /api/cultivos/:id      → desactivar cultivo
// ============================================================
const express = require('express');
const { body, validationResult } = require('express-validator');

const pool            = require('../db/connection');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyToken);

// ── Validaciones comunes ──────────────────────────────────
const cultivoValidaciones = [
  body('fecha_siembra').isDate().withMessage('Fecha de siembra inválida'),
  body('tipo_suelo')
    .optional()
    .isIn(['arenoso', 'limoso', 'arcilloso'])
    .withMessage('Tipo de suelo inválido'),
  body('ph_suelo')
    .optional()
    .isIn(['acido', 'lig_acido', 'neutro', 'lig_alca', 'alca'])
    .withMessage('pH inválido'),
  body('tipo_manejo')
    .optional()
    .isIn(['lluvia', 'riego'])
    .withMessage('Tipo de manejo inválido'),
  body('latitud')
    .optional()
    .isFloat({ min: -90, max: 90 })
    .withMessage('Latitud inválida'),
  body('longitud')
    .optional()
    .isFloat({ min: -180, max: 180 })
    .withMessage('Longitud inválida'),
];

// ── GET /api/cultivos ─────────────────────────────────────
// Devuelve el cultivo activo del usuario (el más reciente)

router.get('/', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, departamento, municipio, latitud, longitud,
              fecha_siembra, tipo_suelo, ph_suelo, tiene_analisis,
              tipo_manejo, creado_en, actualizado_en
       FROM cultivos
       WHERE usuario_id = $1 AND activo = true
       ORDER BY creado_en DESC
       LIMIT 1`,
      [req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.json({ cultivo: null });
    }

    return res.json({ cultivo: resultado.rows[0] });
  } catch (err) {
    console.error('Error al obtener cultivo:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});

// ── GET /api/cultivos/todos ───────────────────────────────
// Historial completo de cultivos del usuario

router.get('/todos', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, departamento, municipio, latitud, longitud,
              fecha_siembra, tipo_suelo, ph_suelo, tipo_manejo,
              activo, creado_en
       FROM cultivos
       WHERE usuario_id = $1
       ORDER BY creado_en DESC`,
      [req.usuario.id]
    );

    return res.json({ cultivos: resultado.rows });
  } catch (err) {
    console.error('Error al listar cultivos:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});

// ── POST /api/cultivos ────────────────────────────────────
// Registra un nuevo cultivo

router.post('/', cultivoValidaciones, async (req, res) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ mensaje: 'Datos inválidos', errores: errores.array() });
  }

  const {
    departamento,
    municipio,
    latitud,
    longitud,
    fecha_siembra,
    tipo_suelo,
    ph_suelo,
    tiene_analisis,
    tipo_manejo,
  } = req.body;

  try {
    // Desactivar cultivos previos del usuario (solo uno activo a la vez)
    await pool.query(
      `UPDATE cultivos SET activo = false WHERE usuario_id = $1 AND activo = true`,
      [req.usuario.id]
    );

    // Insertar nuevo cultivo
    const resultado = await pool.query(
      `INSERT INTO cultivos
         (usuario_id, departamento, municipio, latitud, longitud,
          fecha_siembra, tipo_suelo, ph_suelo, tiene_analisis, tipo_manejo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
       RETURNING *`,
      [
        req.usuario.id,
        departamento   || null,
        municipio      || null,
        latitud        || null,
        longitud       || null,
        fecha_siembra,
        tipo_suelo     || null,
        ph_suelo       || null,
        tiene_analisis ?? false,
        tipo_manejo    || null,
      ]
    );

    return res.status(201).json({
      mensaje: 'Cultivo registrado exitosamente',
      cultivo: resultado.rows[0],
    });

  } catch (err) {
    console.error('Error al registrar cultivo:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});

// ── PUT /api/cultivos/:id ─────────────────────────────────
// Actualiza un cultivo existente del usuario

router.put('/:id', cultivoValidaciones, async (req, res) => {
  const errores = validationResult(req);
  if (!errores.isEmpty()) {
    return res.status(400).json({ mensaje: 'Datos inválidos', errores: errores.array() });
  }

  const { id } = req.params;

  // Verificar que el cultivo pertenece al usuario
  const existe = await pool.query(
    `SELECT id FROM cultivos WHERE id = $1 AND usuario_id = $2`,
    [id, req.usuario.id]
  );

  if (existe.rows.length === 0) {
    return res.status(404).json({ mensaje: 'Cultivo no encontrado' });
  }

  const {
    departamento, municipio, latitud, longitud,
    fecha_siembra, tipo_suelo, ph_suelo, tiene_analisis, tipo_manejo,
  } = req.body;

  try {
    const resultado = await pool.query(
      `UPDATE cultivos
       SET departamento = COALESCE($1, departamento),
           municipio    = COALESCE($2, municipio),
           latitud      = COALESCE($3, latitud),
           longitud     = COALESCE($4, longitud),
           fecha_siembra = COALESCE($5, fecha_siembra),
           tipo_suelo   = COALESCE($6, tipo_suelo),
           ph_suelo     = COALESCE($7, ph_suelo),
           tiene_analisis = COALESCE($8, tiene_analisis),
           tipo_manejo  = COALESCE($9, tipo_manejo)
       WHERE id = $10 AND usuario_id = $11
       RETURNING *`,
      [
        departamento   || null,
        municipio      || null,
        latitud        || null,
        longitud       || null,
        fecha_siembra  || null,
        tipo_suelo     || null,
        ph_suelo       || null,
        tiene_analisis ?? null,
        tipo_manejo    || null,
        id,
        req.usuario.id,
      ]
    );

    return res.json({ mensaje: 'Cultivo actualizado', cultivo: resultado.rows[0] });

  } catch (err) {
    console.error('Error al actualizar cultivo:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});

// ── DELETE /api/cultivos/:id ──────────────────────────────
// Desactiva un cultivo (soft delete)

router.delete('/:id', async (req, res) => {
  const { id } = req.params;

  try {
    const resultado = await pool.query(
      `UPDATE cultivos SET activo = false
       WHERE id = $1 AND usuario_id = $2
       RETURNING id`,
      [id, req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Cultivo no encontrado' });
    }

    return res.json({ mensaje: 'Cultivo eliminado' });
  } catch (err) {
    console.error('Error al eliminar cultivo:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});

module.exports = router;
