// ============================================================
// AgroMaíz — routes/clima.js
// Proxy seguro hacia Open-Meteo (gratuito, sin API key)
// y reverse geocoding via nominatim (gratuito)
//
// GET /api/clima?lat=X&lon=Y   → pronóstico 7 días
// GET /api/geo/reverse?lat=X&lon=Y → departamento/municipio por coordenadas
// GET /api/geo/search?q=texto  → buscar lugar por nombre
// ============================================================
const express = require('express');
const { verifyToken } = require('../middleware/auth');

const router = express.Router();

// Todas las rutas requieren autenticación
router.use(verifyToken);

// ── GET /api/clima ────────────────────────────────────────
// Obtiene pronóstico de 7 días para lat/lon dadas

router.get('/', async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ mensaje: 'Se requieren los parámetros lat y lon' });
  }

  const latNum = parseFloat(lat);
  const lonNum = parseFloat(lon);

  if (isNaN(latNum) || isNaN(lonNum) ||
      latNum < -90 || latNum > 90 ||
      lonNum < -180 || lonNum > 180) {
    return res.status(400).json({ mensaje: 'Coordenadas inválidas' });
  }

  try {
    // Open-Meteo: https://open-meteo.com/en/docs
    const url = new URL('https://api.open-meteo.com/v1/forecast');
    url.searchParams.set('latitude',  latNum);
    url.searchParams.set('longitude', lonNum);
    url.searchParams.set('timezone',  'America/Bogota');

    // Modelo de mayor precisión disponible (combina ECMWF + modelos regionales)
    url.searchParams.set('models', 'best_match');

    // Variables diarias relevantes para cultivos de maíz
    url.searchParams.set('daily', [
      'temperature_2m_max',
      'temperature_2m_min',
      'temperature_2m_mean',
      'precipitation_sum',
      'precipitation_hours',
      'precipitation_probability_max',
      'precipitation_probability_mean',
      'windspeed_10m_max',
      'windgusts_10m_max',
      'et0_fao_evapotranspiration',
      'weathercode',
      'uv_index_max',
    ].join(','));

    // Variables horarias para análisis del día actual
    url.searchParams.set('hourly', [
      'temperature_2m',
      'relativehumidity_2m',
      'precipitation_probability',
      'precipitation',
      'soil_moisture_0_to_1cm',
    ].join(','));

    url.searchParams.set('forecast_days', '7');
    url.searchParams.set('wind_speed_unit', 'kmh');

    const respuesta = await fetch(url.toString());

    if (!respuesta.ok) {
      const texto = await respuesta.text();
      console.error('Error Open-Meteo:', texto);
      return res.status(502).json({ mensaje: 'Error al consultar el servicio de clima' });
    }

    const datos = await respuesta.json();

    // Mapear código WMO a descripción en español
    const descripcionClima = (codigo) => {
      const mapa = {
        0: 'Despejado', 1: 'Mayormente despejado', 2: 'Parcialmente nublado',
        3: 'Nublado', 45: 'Niebla', 48: 'Niebla con escarcha',
        51: 'Llovizna leve', 53: 'Llovizna moderada', 55: 'Llovizna intensa',
        61: 'Lluvia leve', 63: 'Lluvia moderada', 65: 'Lluvia intensa',
        71: 'Nevada leve', 73: 'Nevada moderada', 75: 'Nevada intensa',
        80: 'Chubascos leves', 81: 'Chubascos moderados', 82: 'Chubascos fuertes',
        95: 'Tormenta eléctrica', 96: 'Tormenta con granizo', 99: 'Tormenta severa',
      };
      return mapa[codigo] || 'Variable';
    };

    /**
     * Ajusta el código WMO según la probabilidad real de lluvia.
     * Open-Meteo asigna códigos de lluvia fuerte aunque la probabilidad sea baja,
     * lo que genera íconos de tormenta en días prácticamente secos.
     * Regla: si prob < 20% → nublado; si prob < 40% → nublado con posible llovizna;
     *        si prob < 60% → lluvia leve; solo prob ≥ 60% y lluvia_mm significativa
     *        mantienen el código original de lluvia fuerte.
     */
    const codigoAjustado = (codigo, probMedia, probMax, lluviaMm) => {
      const esLluvia = codigo >= 51;
      if (!esLluvia) return codigo; // despejado/nublado no se toca

      const prob = probMedia ?? probMax ?? 0;
      const mm   = lluviaMm ?? 0;

      if (prob < 20)                    return 2;  // Parcialmente nublado
      if (prob < 40)                    return 3;  // Nublado
      if (prob < 55 || mm < 2)          return 61; // Lluvia leve
      if (prob < 70 || mm < 10)         return 80; // Chubascos leves
      return codigo;                               // Mantener original
    };

    // Construir respuesta limpia
    const pronostico = datos.daily.time.map((fecha, i) => {
      const probMedia = datos.daily.precipitation_probability_mean?.[i] ?? null;
      const probMax   = datos.daily.precipitation_probability_max[i];
      const lluviaMm  = datos.daily.precipitation_sum[i];
      const codigoRaw = datos.daily.weathercode[i];
      const codigo    = codigoAjustado(codigoRaw, probMedia, probMax, lluviaMm);

      return {
        fecha,
        temp_max:       datos.daily.temperature_2m_max[i],
        temp_min:       datos.daily.temperature_2m_min[i],
        temp_media:     datos.daily.temperature_2m_mean?.[i] ?? null,
        lluvia_mm:      lluviaMm,
        horas_lluvia:   datos.daily.precipitation_hours?.[i] ?? null,
        prob_lluvia:    probMedia ?? probMax,
        prob_lluvia_max: probMax,
        prob_lluvia_media: probMedia,
        viento_max:     datos.daily.windspeed_10m_max[i],
        rafagas_max:    datos.daily.windgusts_10m_max?.[i] ?? null,
        evapotranspiracion: datos.daily.et0_fao_evapotranspiration?.[i] ?? null,
        uv_max:         datos.daily.uv_index_max?.[i] ?? null,
        codigo_clima:   codigo,
        codigo_raw:     codigoRaw,
        descripcion:    descripcionClima(codigo),
      };
    });

    return res.json({
      latitud:    latNum,
      longitud:   lonNum,
      timezone:   datos.timezone,
      pronostico,
      generado_en: new Date().toISOString(),
    });

  } catch (err) {
    console.error('Error en /api/clima:', err);
    res.status(500).json({ mensaje: 'Error interno al consultar el clima' });
  }
});

// ── GET /api/clima/geo/reverse ────────────────────────────
// Convierte coordenadas en nombre de lugar (Nominatim)

router.get('/geo/reverse', async (req, res) => {
  const { lat, lon } = req.query;

  if (!lat || !lon) {
    return res.status(400).json({ mensaje: 'Se requieren lat y lon' });
  }

  try {
    const url = `https://nominatim.openstreetmap.org/reverse?lat=${lat}&lon=${lon}&format=json&accept-language=es`;

    const respuesta = await fetch(url, {
      headers: {
        'User-Agent': 'AgroMaiz/1.0 (agromaiz@universidad.edu.co)',
        'Accept-Language': 'es',
      },
    });

    if (!respuesta.ok) {
      return res.status(502).json({ mensaje: 'Error en el servicio de geocodificación' });
    }

    const datos = await respuesta.json();

    // Extraer información relevante para Colombia
    const addr = datos.address || {};
    const lugar = {
      departamento: addr.state      || addr.region || null,
      municipio:    addr.city       || addr.town   || addr.village || addr.municipality || null,
      vereda:       addr.suburb     || addr.hamlet || null,
      pais:         addr.country    || null,
      codigo_pais:  addr.country_code?.toUpperCase() || null,
      lugar_completo: datos.display_name || null,
    };

    return res.json(lugar);

  } catch (err) {
    console.error('Error en geo/reverse:', err);
    res.status(500).json({ mensaje: 'Error interno en geocodificación' });
  }
});

// ── GET /api/clima/geo/search ─────────────────────────────
// Busca lugares por nombre (para autocompletar municipio)

router.get('/geo/search', async (req, res) => {
  const { q } = req.query;

  if (!q || q.trim().length < 3) {
    return res.status(400).json({ mensaje: 'El término de búsqueda debe tener al menos 3 caracteres' });
  }

  try {
    const busqueda = encodeURIComponent(`${q}, Colombia`);
    const url = `https://nominatim.openstreetmap.org/search?q=${busqueda}&format=json&limit=5&accept-language=es&countrycodes=co`;

    const respuesta = await fetch(url, {
      headers: {
        'User-Agent': 'AgroMaiz/1.0 (agromaiz@universidad.edu.co)',
        'Accept-Language': 'es',
      },
    });

    if (!respuesta.ok) {
      return res.status(502).json({ mensaje: 'Error en búsqueda de ubicación' });
    }

    const datos = await respuesta.json();

    const resultados = datos.map(lugar => ({
      nombre:     lugar.display_name,
      lat:        parseFloat(lugar.lat),
      lon:        parseFloat(lugar.lon),
      tipo:       lugar.type,
    }));

    return res.json({ resultados });

  } catch (err) {
    console.error('Error en geo/search:', err);
    res.status(500).json({ mensaje: 'Error interno en búsqueda' });
  }
});

module.exports = router;