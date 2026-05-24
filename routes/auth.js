// ============================================================
// AgroMaíz — routes/auth.js
// POST /api/auth/register  →  crear cuenta
// POST /api/auth/login     →  iniciar sesión
// POST /api/auth/logout    →  cerrar sesión (invalida refresh token)
// GET  /api/auth/me        →  datos del usuario autenticado
// ============================================================
const express  = require('express');
const bcrypt   = require('bcryptjs');
const jwt      = require('jsonwebtoken');
const crypto   = require('crypto');
const { body, validationResult } = require('express-validator');

const pool            = require('../db/connection');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// ── Helpers ───────────────────────────────────────────────

function generarAccessToken(usuario) {
  return jwt.sign(
    { id: usuario.id, email: usuario.email, nombre: usuario.nombre, rol: usuario.rol },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '15m' }
  );
}

async function generarRefreshToken(usuarioId) {
  const token     = crypto.randomBytes(64).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expira    = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 días

  await pool.query(
    `INSERT INTO refresh_tokens (usuario_id, token_hash, expira_en) VALUES ($1, $2, $3)`,
    [usuarioId, tokenHash, expira]
  );

  return token; // devolvemos el token crudo (sin hashear) al cliente
}

// ── POST /api/auth/register ───────────────────────────────

router.post('/register',
  [
    body('nombre').trim().notEmpty().withMessage('El nombre es requerido').isLength({ max: 120 }),
    body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),
    body('password')
      .isLength({ min: 8 }).withMessage('La contraseña debe tener mínimo 8 caracteres')
      .matches(/[A-Z]/).withMessage('Debe incluir al menos una mayúscula')
      .matches(/[0-9]/).withMessage('Debe incluir al menos un número'),
  ],
  async (req, res) => {
    // Validar campos
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ mensaje: 'Datos inválidos', errores: errores.array() });
    }

    const { nombre, email, password } = req.body;

    try {
      // Verificar si el email ya existe
      const existe = await pool.query('SELECT id FROM usuarios WHERE email = $1', [email]);
      if (existe.rows.length > 0) {
        return res.status(409).json({ mensaje: 'Este correo ya está registrado' });
      }

      // Hashear contraseña
      const passwordHash = await bcrypt.hash(password, 12);

      // Insertar usuario
      const resultado = await pool.query(
        `INSERT INTO usuarios (nombre, email, password_hash, rol)
         VALUES ($1, $2, $3, 'agricultor')
         RETURNING id, nombre, email, rol, creado_en`,
        [nombre, email, passwordHash]
      );

      const usuario = resultado.rows[0];

      // Generar tokens
      const accessToken  = generarAccessToken(usuario);
      const refreshToken = await generarRefreshToken(usuario.id);

      return res.status(201).json({
        mensaje: 'Cuenta creada exitosamente',
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
        accessToken,
        refreshToken,
      });

    } catch (err) {
      console.error('Error en register:', err);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  }
);

// ── POST /api/auth/login ──────────────────────────────────

router.post('/login',
  [
    body('email').isEmail().withMessage('Correo inválido').normalizeEmail(),
    body('password').notEmpty().withMessage('La contraseña es requerida'),
  ],
  async (req, res) => {
    const errores = validationResult(req);
    if (!errores.isEmpty()) {
      return res.status(400).json({ mensaje: 'Datos inválidos', errores: errores.array() });
    }

    const { email, password } = req.body;

    try {
      // Buscar usuario por email
      const resultado = await pool.query(
        `SELECT id, nombre, email, password_hash, rol, activo FROM usuarios WHERE email = $1`,
        [email]
      );

      if (resultado.rows.length === 0) {
        return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
      }

      const usuario = resultado.rows[0];

      if (!usuario.activo) {
        return res.status(403).json({ mensaje: 'Cuenta desactivada. Contacta al soporte.' });
      }

      // Verificar contraseña
      const coincide = await bcrypt.compare(password, usuario.password_hash);
      if (!coincide) {
        return res.status(401).json({ mensaje: 'Correo o contraseña incorrectos' });
      }

      // Generar tokens
      const accessToken  = generarAccessToken(usuario);
      const refreshToken = await generarRefreshToken(usuario.id);

      return res.json({
        mensaje: 'Sesión iniciada',
        usuario: { id: usuario.id, nombre: usuario.nombre, email: usuario.email, rol: usuario.rol },
        accessToken,
        refreshToken,
      });

    } catch (err) {
      console.error('Error en login:', err);
      res.status(500).json({ mensaje: 'Error interno del servidor' });
    }
  }
);

// ── POST /api/auth/refresh ────────────────────────────────
// Renueva el access token usando el refresh token

router.post('/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  if (!refreshToken) {
    return res.status(400).json({ mensaje: 'Refresh token requerido' });
  }

  const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');

  try {
    const resultado = await pool.query(
      `SELECT rt.usuario_id, rt.expira_en,
              u.id, u.nombre, u.email, u.rol
       FROM refresh_tokens rt
       JOIN usuarios u ON u.id = rt.usuario_id
       WHERE rt.token_hash = $1`,
      [tokenHash]
    );

    if (resultado.rows.length === 0) {
      return res.status(401).json({ mensaje: 'Refresh token inválido' });
    }

    const row = resultado.rows[0];

    if (new Date(row.expira_en) < new Date()) {
      // Eliminar token expirado
      await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
      return res.status(401).json({ mensaje: 'Refresh token expirado. Inicia sesión nuevamente.' });
    }

    // Rotar refresh token (invalidar el viejo, crear uno nuevo)
    await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);

    const newAccessToken  = generarAccessToken(row);
    const newRefreshToken = await generarRefreshToken(row.usuario_id);

    return res.json({ accessToken: newAccessToken, refreshToken: newRefreshToken });

  } catch (err) {
    console.error('Error en refresh:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});

// ── POST /api/auth/logout ─────────────────────────────────

router.post('/logout', async (req, res) => {
  const { refreshToken } = req.body;

  if (refreshToken) {
    const tokenHash = crypto.createHash('sha256').update(refreshToken).digest('hex');
    try {
      await pool.query('DELETE FROM refresh_tokens WHERE token_hash = $1', [tokenHash]);
    } catch (_) { /* ignora errores al borrar */ }
  }

  return res.json({ mensaje: 'Sesión cerrada' });
});

// ── GET /api/auth/me ──────────────────────────────────────

router.get('/me', verifyToken, async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT id, nombre, email, rol, creado_en FROM usuarios WHERE id = $1`,
      [req.usuario.id]
    );

    if (resultado.rows.length === 0) {
      return res.status(404).json({ mensaje: 'Usuario no encontrado' });
    }

    return res.json({ usuario: resultado.rows[0] });
  } catch (err) {
    console.error('Error en /me:', err);
    res.status(500).json({ mensaje: 'Error interno' });
  }
});

module.exports = router;
