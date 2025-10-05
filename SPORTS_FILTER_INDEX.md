# 📚 Índice - Sistema de Filtrado de Deportes

## 🎯 Navegación Rápida

### Para Empezar
- 🚀 **[QUICK_START_GUIDE.md](./QUICK_START_GUIDE.md)** - Empieza aquí (15 minutos)
- 📋 **[SPORTS_FILTER_IMPLEMENTATION_SUMMARY.md](./SPORTS_FILTER_IMPLEMENTATION_SUMMARY.md)** - Resumen ejecutivo

### Implementación por Fases

#### Fase 1: Base de Datos
- 📄 **[migrations/add_sports_filter_to_trends.sql](./migrations/add_sports_filter_to_trends.sql)** - Script SQL
- 📖 **[migrations/README_SPORTS_MIGRATION.md](./migrations/README_SPORTS_MIGRATION.md)** - Guía de migración

#### Fase 2 y 3: Backend (NewsCron)
- 💻 **[fetch_trending_process.js](./fetch_trending_process.js)** - Código modificado
- ✅ Funciones implementadas: `isSportsTrend()`, `filterAndBalanceTrends()`

#### Fase 3.5: Backend (ExtractorW)
- 📖 **[EXTRACTORW_SPORTS_INTEGRATION.md](./EXTRACTORW_SPORTS_INTEGRATION.md)** - Guía de modificación

#### Fase 4: Frontend (ThePulse)
- 📖 **[FRONTEND_SPORTS_DIVISION_PLAN.md](./FRONTEND_SPORTS_DIVISION_PLAN.md)** - Plan completo de UI

---

## 📊 Estado de Implementación

| Fase | Componente | Estado | Archivo Principal |
|------|-----------|--------|-------------------|
| 1 | SQL Migration | ⏳ Pendiente | `migrations/add_sports_filter_to_trends.sql` |
| 2 | Detección | ✅ Completo | `fetch_trending_process.js` |
| 3 | Balanceo | ✅ Completo | `fetch_trending_process.js` |
| 3.5 | ExtractorW | ⏳ Pendiente | Ver `EXTRACTORW_SPORTS_INTEGRATION.md` |
| 4 | Frontend | ⏳ Pendiente | Ver `FRONTEND_SPORTS_DIVISION_PLAN.md` |

---

## 🎓 Conceptos Clave

### Sistema de Balanceo
- **Input**: ~25 trends del VPS
- **Clasificación**: Deportivos vs No deportivos
- **Output**: 15 trends balanceados (máx 5 deportes + máx 10 generales)
- **Proporción target**: ≤33% deportes

### Detección de Deportes
**Keywords guatemaltecas:**
- Equipos: Municipal, Comunicaciones, Antigua, Xelajú, Cobán, etc.
- Términos: fútbol, liga, selección, mundial, gol, partido, etc.
- Eventos: copa, champions, concacaf, eliminatorias, etc.

**Threshold**: ≥1 coincidencia = Deportivo

### Categorías Principales
1. **Deportes** ⚽ - Fútbol, ligas, selección
2. **Política** 🏛️ - Congreso, gobierno, leyes
3. **Económica** 💰 - Finanzas, banco, comercio
4. **Seguridad** 🚔 - Violencia, PNC, crimen
5. **Sociales** 👥 - Educación, salud, cultura
6. **Entretenimiento** 🎭 - Música, cine, TV
7. **General** 📰 - Otros temas

---

## 🔍 Queries Útiles

### Verificar migración
```sql
SELECT column_name FROM information_schema.columns 
WHERE table_name = 'trends' 
AND column_name IN ('is_deportes', 'categoria_principal');
```

### Ver último trend
```sql
SELECT id, timestamp, categoria_principal, is_deportes 
FROM trends 
ORDER BY created_at DESC 
LIMIT 1;
```

### Distribución actual
```sql
SELECT categoria_principal, COUNT(*) as total
FROM trends
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY categoria_principal
ORDER BY total DESC;
```

### Estadísticas diarias
```sql
SELECT * FROM trends_distribution_stats
WHERE fecha >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY fecha DESC;
```

---

## 🧪 Testing

### Backend
```bash
# Probar NewsCron
cd "Pulse Journal/NewsCron"
node fetch_trending_process.js
```

### Verificación
```sql
-- Último trend debe tener is_deportes y categoria_principal
SELECT * FROM trends ORDER BY created_at DESC LIMIT 1;
```

---

## 📈 Métricas de Éxito

### Semana 1
- **Balanceo**: ≤33% deportes en ≥90% de ejecuciones
- **Clasificación**: >95% correctamente clasificados
- **Performance**: <5% aumento en tiempo de procesamiento
- **Estabilidad**: Sin errores críticos

### Mes 1
- **Engagement**: Usuarios visitan ambas tabs (General + Deportes)
- **CTR**: Distribución balanceada de clicks
- **Feedback**: Reducción de quejas sobre saturación deportiva

---

## 🆘 Troubleshooting

### Migración SQL
❌ **Error**: Column already exists  
✅ **Solución**: Normal, el script usa `IF NOT EXISTS`

### NewsCron
❌ **Error**: No balanceo visible en logs  
✅ **Solución**: Verifica que ejecutaste el archivo correcto con funciones nuevas

### ExtractorW
❌ **Error**: is_deportes siempre null  
✅ **Solución**: ExtractorW no está clasificando, revisar implementación

### Frontend
❌ **Error**: Tabs no aparecen  
✅ **Solución**: Verificar que useTrends tiene parámetro filterSports

---

## 📞 Soporte

### Documentación Adicional
- Sistema de Logs: `SYSTEM_LOGS_README.md`
- Análisis Político: `README_POLITICS_INTEGRATION.md`
- Sentimientos: `README_SENTIMENT.md`

### Archivos de Configuración
- Cron: `cron_config.md`
- Variables: `env.example.updated`

---

## ✅ Checklist de Implementación

### Inmediato (Hoy)
- [ ] Leer `QUICK_START_GUIDE.md`
- [ ] Ejecutar migración SQL
- [ ] Probar NewsCron manualmente
- [ ] Verificar logs de balanceo

### Esta Semana
- [ ] Modificar ExtractorW
- [ ] Probar clasificación end-to-end
- [ ] Iniciar implementación frontend

### Próxima Semana
- [ ] Completar frontend
- [ ] Testing integral
- [ ] Deploy a staging
- [ ] UAT

### Monitoreo Continuo
- [ ] Revisar métricas diarias
- [ ] Ajustar keywords si es necesario
- [ ] Recopilar feedback de usuarios

---

## 🎯 Flujo Visual

```
┌──────────────────────────────────────────────────────────────┐
│                    CRON DIARIO (6:00 PM)                     │
│                                                              │
│  VPS → Trends Raw (25) → NewsCron [BALANCEO] → (15)        │
│                              ↓                               │
│                        5 deportes                            │
│                        10 generales                          │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                      EXTRACTORW                              │
│                                                              │
│  Procesa 15 → Genera Keywords/WordCloud → [CLASIFICA]      │
│                              ↓                               │
│                    detectSportsContent()                     │
│                              ↓                               │
│                  is_deportes + categoria_principal           │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                      SUPABASE                                │
│                                                              │
│  tabla: trends                                              │
│  ├─ is_deportes: boolean                                   │
│  └─ categoria_principal: string                             │
└──────────────────────┬───────────────────────────────────────┘
                       │
                       ▼
┌──────────────────────────────────────────────────────────────┐
│                      THEPULSE                                │
│                                                              │
│  Tab General: WHERE is_deportes = false                     │
│  Tab Deportes: WHERE is_deportes = true                     │
│  Estadísticas: trends_distribution_stats                    │
└──────────────────────────────────────────────────────────────┘
```

---

**Última actualización**: 2025-10-05  
**Versión**: 1.0.0  
**Estado**: Implementación Fase 1-3 completa, Fase 4 pendiente
