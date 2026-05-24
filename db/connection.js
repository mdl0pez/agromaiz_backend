// ============================================================
// AgroMaíz — db/connection.js
// Pool de conexiones a PostgreSQL
// ============================================================
const { Pool } = require('pg');

const pool = new Pool({
    host:     process.env.DB_HOST     || 'localhost',
    port:     parseInt(process.env.DB_PORT) || 5432,
    database: process.env.DB_NAME     || 'db_agromaiz',
    user:     process.env.DB_USER     || 'user_dyp',
    password: process.env.DB_PASSWORD || '',
    // En producción (Railway) usa la URL completa en vez de los campos separados
    ...(process.env.DATABASE_URL && {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    }),
    max:              10,   // máximo de conexiones simultáneas
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
    });

    // Verificar conexión al arrancar
    pool.connect((err, client, release) => {
    if (err) {
        console.error('❌ Error conectando a PostgreSQL:', err.message);
        return;
    }
    release();
    console.log('✅ Conectado a PostgreSQL —', process.env.DB_NAME || 'agromaiz_db');
});

module.exports = pool;