// ============================================================
// AgroMaíz — server.js
// Punto de entrada del servidor Express
// ============================================================
require('dotenv').config();
const express = require('express');
const cors    = require('cors');

const authRoutes    = require('./routes/auth');
const cultivosRoutes = require('./routes/cultivos');
const climaRoutes   = require('./routes/clima');
const chatRoutes    = require('./routes/chat');

const app  = express();
const PORT = process.env.PORT || 3000;

// ── Middlewares globales ──────────────────────────────────
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// CORS: permite peticiones desde el frontend
const originesPermitidos = (process.env.FRONTEND_URL || 'http://127.0.0.1:5500')
  .split(',')
  .map(o => o.trim());

app.use(cors({
  origin: (origin, callback) => {
    // Permitir peticiones sin origen (curl, Postman) en desarrollo
    if (!origin || originesPermitidos.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error(`CORS bloqueado para: ${origin}`));
    }
  },
  credentials: true,
  methods:     ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Rutas ─────────────────────────────────────────────────
app.use('/api/auth',     authRoutes);
app.use('/api/cultivos', cultivosRoutes);
app.use('/api/clima',    climaRoutes);
app.use('/api/chat',     chatRoutes);

// Ruta de salud — útil para verificar que el servidor responde
app.get('/api/health', (req, res) => {
  res.json({
    estado:    'ok',
    timestamp: new Date().toISOString(),
    entorno:   process.env.NODE_ENV || 'development',
    version:   '1.0.0',
  });
});

// ── Ruta no encontrada ────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ mensaje: 'Ruta no encontrada' });
});

// ── Manejo global de errores ──────────────────────────────
app.use((err, req, res, next) => {
  console.error('Error no manejado:', err);
  res.status(500).json({
    mensaje: process.env.NODE_ENV === 'production'
      ? 'Error interno del servidor'
      : err.message,
  });
});

// ── Arrancar servidor ─────────────────────────────────────
app.listen(PORT, () => {
  console.log(`🌽 AgroMaíz API corriendo en http://localhost:${PORT}`);
  console.log(`   Entorno: ${process.env.NODE_ENV || 'development'}`);
  console.log(`   Frontend permitido: ${originesPermitidos.join(', ')}`);
  console.log(`   Rutas: /api/auth  /api/cultivos  /api/clima  /api/chat`);
});
