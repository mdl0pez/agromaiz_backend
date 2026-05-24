// ============================================================
// AgroMaíz — middleware/auth.js
// Verifica el JWT en cada ruta protegida
// ============================================================
const jwt = require('jsonwebtoken');

/**
 * Middleware: verifyToken
 * Lee el header Authorization: Bearer <token>, lo verifica
 * y adjunta el payload decodificado en req.usuario.
 */
function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ mensaje: 'Token requerido' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.usuario = decoded; // { id, email, nombre, rol }
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ mensaje: 'Token expirado', expirado: true });
    }
    return res.status(401).json({ mensaje: 'Token inválido' });
  }
}

module.exports = { verifyToken };
