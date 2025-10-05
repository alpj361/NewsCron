# 🚀 Guía de Inicio Rápido - Sistema de Filtrado de Deportes

## ⚡ TL;DR

Sistema que balancea automáticamente trends: **máximo 5 deportes + mínimo 10 generales** por día, evitando saturación deportiva en tu dashboard.

---

## 📋 Paso 1: Ejecutar Migración SQL (5 minutos)

### Opción A: Supabase Dashboard (Recomendado)

1. Ve a [Supabase Dashboard](https://supabase.com/dashboard)
2. Selecciona tu proyecto
3. Ve a: **SQL Editor**
4. Abre el archivo: `NewsCron/migrations/add_sports_filter_to_trends.sql`
5. Copia todo el contenido
6. Pégalo en el editor
7. Click en **Run** ▶️
8. Espera los mensajes NOTICE con el resumen

### Opción B: Supabase MCP

Si usas el MCP de Supabase configurado en Cursor:
1. Ejecuta el archivo SQL directamente desde el MCP
2. Verifica los resultados

### ✅ Verificación

Ejecuta en SQL Editor:
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'trends' 
AND column_name IN ('is_deportes', 'categoria_principal');
```

Deberías ver 2 filas:
```
is_deportes
categoria_principal
```

---

## 📋 Paso 2: Probar NewsCron (10 minutos)

### Ejecutar Manualmente

```bash
cd "Pulse Journal/NewsCron"
node fetch_trending_process.js
```

### 👀 Lo Que Debes Ver

Busca estos logs en la salida:

```
🎯 [FILTRO] Iniciando balanceo de 25 trends...
   ⚽ Deportivo: "Municipal vs Comunicaciones"
   📰 General: "Congreso aprueba ley"
   ...

📊 [FILTRO] Clasificación completada:
   ⚽ Deportivos encontrados: 12
   📰 No deportivos encontrados: 13

✅ [FILTRO] Balanceo completado:
   ⚽ Deportivos seleccionados: 5/5
   📰 No deportivos seleccionados: 10/10
   📊 Total a procesar: 15/15
   🎯 Proporción deportes: 33%
```

### ✅ Verificación

Si ves estos logs, **el balanceo está funcionando** ✅

---

## 📋 Paso 3: Modificar ExtractorW (30 minutos)

### ⚠️ Requisito: Autenticación

ExtractorW requiere bearer token para modificaciones.

**Opciones:**
1. Solicita el token al administrador
2. O proporciona el documento `EXTRACTORW_SPORTS_INTEGRATION.md` al admin para que lo implemente

### 📝 Archivo a Modificar

`Pulse Journal/ExtractorW/server/routes/trends.js`

### 🎯 Cambios Necesarios

1. **Agregar función** `detectSportsContent()` (línea ~1050)
2. **Modificar INSERT** en `/api/cron/processTrends` (línea ~1080)
   - Agregar: `is_deportes: categoryDetection.isDeportes`
   - Agregar: `categoria_principal: categoryDetection.categoria`

### 📖 Guía Completa

Lee: `EXTRACTORW_SPORTS_INTEGRATION.md` para instrucciones detalladas con código.

### ✅ Verificación

Después de modificar, ejecuta NewsCron y verifica en Supabase:

```sql
SELECT id, categoria_principal, is_deportes 
FROM trends 
ORDER BY created_at DESC 
LIMIT 1;
```

Deberías ver los campos poblados:
```
id          | categoria_principal | is_deportes
------------|---------------------|------------
abc-123-... | Deportes           | true
```

---

## 📋 Paso 4: Actualizar Frontend (2-3 horas)

### 📖 Plan Completo

Lee: `FRONTEND_SPORTS_DIVISION_PLAN.md` para el plan detallado de implementación.

### 🎯 Archivos a Crear/Modificar

```
ThePulse/src/
├── types/trends.ts              ← Agregar is_deportes, categoria_principal
├── hooks/useTrends.ts           ← Agregar queries filtradas
├── components/trends/
│   ├── TrendsStats.tsx          ← CREAR (nuevo)
│   ├── TrendsAbout.tsx          ← MODIFICAR (agregar tabs)
│   └── TrendsList.tsx           ← MODIFICAR (agregar tabs)
```

### 🚀 Quick Implementation

#### 1. Tipos (5 min)
```typescript
// types/trends.ts
export interface Trend {
  // ... campos existentes
  is_deportes: boolean;
  categoria_principal: string;
}
```

#### 2. Hook (10 min)
```typescript
// hooks/useTrends.ts
export function useTrends(filterSports?: boolean) {
  let query = supabase.from('trends').select('*');
  if (filterSports !== undefined) {
    query = query.eq('is_deportes', filterSports);
  }
  // ...
}
```

#### 3. UI (1-2 horas)
Ver ejemplos completos en `FRONTEND_SPORTS_DIVISION_PLAN.md`

---

## 🧪 Testing Rápido

### 1. Backend (NewsCron + ExtractorW)

```bash
# Ejecutar cron manualmente
node fetch_trending_process.js

# Ver último trend guardado
# (En Supabase SQL Editor)
SELECT * FROM trends ORDER BY created_at DESC LIMIT 1;
```

**Esperado:**
- `is_deportes`: true o false
- `categoria_principal`: una de las categorías

### 2. Frontend (ThePulse)

1. Abrir la página de Trends
2. Verificar tabs: "General" y "Deportes"
3. Click en cada tab
4. Verificar que muestra diferentes trends

**Esperado:**
- Tab "General": Solo trends con `is_deportes = false`
- Tab "Deportes": Solo trends con `is_deportes = true`

---

## 📊 Monitoreo (Primera Semana)

### Queries Útiles

#### Ver distribución actual
```sql
SELECT 
    categoria_principal,
    COUNT(*) as total,
    ROUND(COUNT(*) * 100.0 / SUM(COUNT(*)) OVER (), 2) as porcentaje
FROM trends
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY categoria_principal
ORDER BY total DESC;
```

#### Ver balanceo del último cron
```sql
SELECT 
    DATE(created_at) as fecha,
    COUNT(*) as total,
    SUM(CASE WHEN is_deportes THEN 1 ELSE 0 END) as deportivos,
    SUM(CASE WHEN NOT is_deportes THEN 1 ELSE 0 END) as generales
FROM trends
WHERE created_at >= CURRENT_DATE
GROUP BY DATE(created_at);
```

### 🎯 Targets Semana 1

- ✅ **Balanceo**: ≤33% deportes en cada ejecución del cron
- ✅ **Clasificación**: >95% correctamente clasificados
- ✅ **Performance**: <5% aumento en tiempo de procesamiento
- ✅ **Estabilidad**: Sin errores críticos

---

## 🆘 Troubleshooting

### Problema: "Column does not exist: is_deportes"
**Solución**: La migración SQL no se ejecutó. Ve al Paso 1.

### Problema: Todos los trends salen como "General"
**Solución**: ExtractorW no está clasificando. Ve al Paso 3.

### Problema: El cron no balancea (salen >5 deportes)
**Solución**: Revisa logs del cron. Puede ser un día con muchos eventos deportivos reales.

### Problema: Frontend no muestra tabs
**Solución**: Verifica que los componentes se actualizaron correctamente. Ve al Paso 4.

---

## 📚 Documentación Completa

Para más detalles, consulta:

- **Migración SQL**: `README_SPORTS_MIGRATION.md`
- **ExtractorW**: `EXTRACTORW_SPORTS_INTEGRATION.md`
- **Frontend**: `FRONTEND_SPORTS_DIVISION_PLAN.md`
- **Resumen**: `SPORTS_FILTER_IMPLEMENTATION_SUMMARY.md`

---

## ✅ Checklist Rápido

- [ ] Migración SQL ejecutada
- [ ] NewsCron probado manualmente y funciona
- [ ] ExtractorW modificado y funcionando
- [ ] Frontend actualizado con tabs
- [ ] Testing básico completado
- [ ] Monitoreo de primera semana iniciado

---

**¿Dudas?** Revisa los documentos específicos o los logs del sistema para troubleshooting.

**¡Listo!** 🎉 Tu sistema de balanceo de deportes está funcionando.
