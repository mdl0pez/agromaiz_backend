# AgroMaíz — Parches de HTML
## Cambios necesarios en los archivos HTML del frontend

### 1. pages/login.html
Reemplaza el bloque `<script>` al final del body por:

```html
<script src="../js/api.js"></script>
<script src="../js/auth.js"></script>
<script src="../js/login.js"></script>
```

### 2. pages/register.html
Reemplaza el bloque `<script>` al final del body por:

```html
<script src="../js/api.js"></script>
<script src="../js/auth.js"></script>
<script src="../js/register.js"></script>
```

### 3. pages/registrar-cultivo.html
En el `<head>`, agregar después del `<title>`:
```html
<!-- Sugerencias de municipio -->
<style>
  #municipio-suggestions {
    display: none;
    position: absolute;
    z-index: 100;
    background: white;
    border: 1px solid var(--gray-200);
    border-radius: 8px;
    box-shadow: 0 4px 12px rgba(0,0,0,.1);
    max-height: 200px;
    overflow-y: auto;
    width: 100%;
    top: 100%;
    left: 0;
  }
  #municipio-input { width: 100%; }
</style>
```

En el campo de ubicación manual, reemplazar el `<select name="departamento">` por:
```html
<div style="position:relative">
  <input
    type="text"
    id="municipio-input"
    placeholder="Escribe tu municipio o vereda..."
    autocomplete="off"
    style="width:100%; padding:.6rem .75rem; border:1px solid var(--gray-300); border-radius:8px; font-size:.9rem;"
  />
  <ul id="municipio-suggestions"></ul>
</div>
<input type="hidden" name="departamento" id="departamento-hidden" />
<input type="hidden" name="municipio"    id="municipio-hidden"    />
```

Agregar un div para el pronóstico en el paso 3:
```html
<!-- Dentro de wizard-step id="step-3", después del encabezado -->
<div class="wizard-card">
  <div class="wc-header">
    <span class="wc-icon">🌤️</span>
    <div><h3>Pronóstico 7 días</h3><p>Basado en tu ubicación de siembra</p></div>
  </div>
  <div id="clima-forecast">
    <p style="color:var(--gray-400);text-align:center;padding:1rem;font-size:.875rem">
      La ubicación se obtiene del paso 1. Si usaste GPS, el pronóstico cargará automáticamente.
    </p>
  </div>
</div>
```

Reemplazar los scripts al final:
```html
<script src="../js/api.js"></script>
<script src="../js/registrar-cultivo.js"></script>
```

### 4. Páginas protegidas (dashboard, asistente, etc.)
Agregar al inicio del script de cada página protegida:
```html
<script src="../js/api.js"></script>
<script>
  // Verificar autenticación
  requireAuth();
  // Mostrar nombre del usuario
  const u = Auth.getUsuario();
  if (u) document.querySelectorAll('.usuario-nombre').forEach(el => el.textContent = u.nombre);
</script>
```

### 5. Botón de cerrar sesión (navbar)
```html
<button onclick="Auth.cerrarSesion()" class="btn-logout">Cerrar sesión</button>
```
