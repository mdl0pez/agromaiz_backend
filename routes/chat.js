// ============================================================
// AgroMaíz — routes/chat.js
// Proxy seguro hacia Groq.
// La API key nunca sale del servidor.
//
// POST /api/chat        → envía mensaje, devuelve respuesta IA
// GET  /api/chat/historial → últimas N conversaciones guardadas
// ============================================================
const express = require('express');
const pool    = require('../db/connection');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();
router.use(verifyToken); // todas las rutas requieren JWT

// ── Helpers de contexto ───────────────────────────────────

function calcularEtapa(fechaSiembra) {
  if (!fechaSiembra) return 'no determinada';
  const dias = Math.floor((Date.now() - new Date(fechaSiembra)) / 86400000);
  if (dias < 10)  return `Siembra y emergencia (día ${dias})`;
  if (dias < 30)  return `Crecimiento vegetativo temprano — V3 a V6 (día ${dias})`;
  if (dias < 50)  return `Crecimiento vegetativo tardío — V6 a V10 (día ${dias})`;
  if (dias < 70)  return `Floración y polinización — VT/R1 (día ${dias})`;
  if (dias < 100) return `Llenado de grano — R2 a R4 (día ${dias})`;
  return `Madurez y cosecha — R5 a R6 (día ${dias})`;
}

function mapeoSuelo(val) {
  const m = {
    arenoso:   'arenoso (baja retención de agua, drena rápido)',
    limoso:    'limoso (buena retención, fertilidad media)',
    arcilloso: 'arcilloso (alta retención, puede encharcarse)',
  };
  return m[val] || val || 'no registrado';
}

function mapeoManejo(val) {
  return val === 'lluvia' ? 'solo lluvia (secano)'
       : val === 'riego'  ? 'con riego complementario'
       : val || 'no registrado';
}

function mapeoPH(val) {
  const m = {
    acido:     'ácido (< 6) — posible deficiencia de P y Ca',
    lig_acido: 'ligeramente ácido (6–6.5) — aceptable para maíz',
    neutro:    'neutro (6.5–7.5) — óptimo para maíz',
    lig_alca:  'ligeramente alcalino (7.5–8) — puede limitar micronutrientes',
    alca:      'alcalino (> 8) — riesgo de deficiencias severas',
  };
  return m[val] || val || 'no registrado';
}

/**
 * Construye el system prompt inyectando los datos reales del cultivo
 * consultados directamente desde la base de datos del usuario autenticado.
 */
async function construirSystemPrompt(usuarioId, nombre) {
  // Consultar cultivo activo del usuario desde la BD
  let contexto = '';
  try {
    const res = await pool.query(
      `SELECT departamento, municipio, latitud, longitud,
              fecha_siembra, tipo_suelo, ph_suelo,
              tiene_analisis, tipo_manejo
       FROM cultivos
       WHERE usuario_id = $1 AND activo = true
       ORDER BY creado_en DESC LIMIT 1`,
      [usuarioId]
    );

    if (res.rows.length > 0) {
      const c    = res.rows[0];
      const dias = c.fecha_siembra
        ? Math.floor((Date.now() - new Date(c.fecha_siembra)) / 86400000)
        : null;

      const lugar = [c.municipio, c.departamento].filter(Boolean).join(', ') || 'no registrado';

      contexto = `
DATOS REALES DEL CULTIVO (extraídos de la base de datos):
• Productor: ${nombre}
• Ubicación: ${lugar}${c.latitud ? ` (${parseFloat(c.latitud).toFixed(4)}°N, ${parseFloat(c.longitud).toFixed(4)}°W)` : ''}
• Fecha de siembra: ${c.fecha_siembra ? new Date(c.fecha_siembra).toLocaleDateString('es-CO') : 'no registrada'}
• Días desde la siembra: ${dias !== null ? dias + ' días' : 'no calculable'}
• Etapa fenológica estimada: ${calcularEtapa(c.fecha_siembra)}
• Tipo de suelo: ${mapeoSuelo(c.tipo_suelo)}
• pH del suelo: ${mapeoPH(c.ph_suelo)}
• Tiene análisis de suelo: ${c.tiene_analisis ? 'sí' : 'no'}
• Tipo de manejo: ${mapeoManejo(c.tipo_manejo)}`;
    } else {
      contexto = `
DATOS DEL CULTIVO: ${nombre} aún no ha registrado su cultivo en la plataforma.
Si hace preguntas técnicas específicas, puedes pedirle amablemente que lo registre.`;
    }
  } catch (err) {
    console.error('Error al consultar cultivo para prompt:', err.message);
    contexto = '\nDATO DEL CULTIVO: No se pudo obtener la información del cultivo.';
  }

  return `Eres AgroBot, el asistente agrícola inteligente de la plataforma AgroMaíz.
Tu misión es ayudar a pequeños y medianos productores de maíz en Colombia —
especialmente de la región Caribe y zonas cálidas — a tomar mejores decisiones
agronómicas, de forma clara, cercana y práctica.

PERSONALIDAD:
• Hablas en español colombiano coloquial pero correcto.
• Eres cercano y empático — el productor es tu aliado.
• Usas ejemplos concretos del campo (sin tecnicismos innecesarios).
• Cuando no sabes algo con certeza, lo dices y recomiendas un agrónomo local.
${contexto}

CÓMO RESPONDER:
1. Cuando el usuario describa síntomas (hojas amarillas, manchas, plantas débiles,
   suelo seco, etc.), ofrece 2–3 causas posibles ordenadas por probabilidad y
   pasos concretos para confirmar cuál es.
2. Adapta las recomendaciones a la etapa fenológica del cultivo cuando sea relevante.
3. Para fertilización y plaguicidas, da principios activos genéricos, no marcas.
   Siempre advierte consultar con un ingeniero agrónomo antes de aplicar.
4. Respuestas máximo de 4 párrafos cortos o lista de máximo 5 puntos.
   Sé conciso — el productor lee desde el celular.
5. Si la pregunta no tiene relación con agricultura o maíz, redirige amablemente.
6. Cierra siempre con una acción concreta que el productor puede hacer hoy.`;
}

// ── POST /api/chat ────────────────────────────────────────
// Recibe los mensajes del frontend, llama a Groq con la key del servidor
// y guarda la conversación en la BD.

router.post('/', async (req, res) => {
  const { mensajes } = req.body;

  if (!Array.isArray(mensajes) || mensajes.length === 0) {
    return res.status(400).json({ mensaje: 'Se requiere el array de mensajes' });
  }

  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) {
    console.error('GROQ_API_KEY no configurada en .env');
    return res.status(503).json({ mensaje: 'El servicio de IA no está configurado en el servidor' });
  }

  try {
    // Construir system prompt con datos reales del cultivo del usuario
    const usuario      = req.usuario;
    const systemPrompt = await construirSystemPrompt(usuario.id, usuario.nombre);

    // Llamada a Groq (API compatible con OpenAI)
    const groqRes = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type':  'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model:      'llama-3.1-8b-instant',
        max_tokens: 1024,
        messages:   [
          { role: 'system', content: systemPrompt },
          ...mensajes,
        ],
      }),
    });

    if (!groqRes.ok) {
      const errData = await groqRes.json().catch(() => ({}));
      const errMsg  = errData?.error?.message || `Error Groq ${groqRes.status}`;
      console.error('Error Groq:', errMsg);
      return res.status(502).json({ mensaje: errMsg });
    }

    const groqData  = await groqRes.json();
    const respuesta = groqData.choices?.[0]?.message?.content || '';

    // ── Guardar conversación en BD ────────────────────────
    // Solo guardamos el último par pregunta-respuesta para no saturar la BD
    const ultimoMensaje = mensajes[mensajes.length - 1];
    if (ultimoMensaje?.role === 'user') {
      try {
        await pool.query(
          `INSERT INTO conversaciones (usuario_id, rol, contenido)
           VALUES ($1, 'user', $2), ($1, 'assistant', $3)`,
          [usuario.id, ultimoMensaje.content, respuesta]
        );
      } catch (dbErr) {
        // Si la tabla aún no existe, solo loguea — no falla el chat
        if (!dbErr.message.includes('no existe') && !dbErr.message.includes('does not exist')) {
          console.error('Error al guardar conversación:', dbErr.message);
        }
      }
    }

    return res.json({ texto: respuesta });

  } catch (err) {
    console.error('Error en /api/chat:', err.message);
    return res.status(500).json({ mensaje: 'Error interno al procesar la consulta' });
  }
});

// ── GET /api/chat/historial ───────────────────────────────
// Devuelve las últimas 50 conversaciones del usuario

router.get('/historial', async (req, res) => {
  try {
    const resultado = await pool.query(
      `SELECT rol, contenido, creado_en
       FROM conversaciones
       WHERE usuario_id = $1
       ORDER BY creado_en ASC
       LIMIT 50`,
      [req.usuario.id]
    );

    return res.json({ mensajes: resultado.rows });
  } catch (err) {
    // Si la tabla no existe todavía, devuelve array vacío
    return res.json({ mensajes: [] });
  }
});

module.exports = router;
