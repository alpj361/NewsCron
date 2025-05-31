# Configuración de Cron Jobs

## Scripts Disponibles

### 1. `fetch_and_store_news.js` (Existente)
- **Función**: Obtiene noticias por categoría y las almacena en Supabase
- **Frecuencia recomendada**: Todos los dias a las 5:00AM y 5:00PM
- **Tabla destino**: `news`

### 2. `fetch_trending_and_tweets.js` (Nuevo)
- **Función**: Obtiene trending topics y busca tweets relacionados usando Nitter
- **Frecuencia**: Todos los días a las 6:00 AM y 6:00 PM
- **Tabla destino**: `trending_tweets`

## Configuración de Crontab

```bash
# Editar crontab
crontab -e

# Agregar las siguientes líneas:

# Noticias cada 30 minutos
*/30 * * * * cd /path/to/NewsCron && node fetch_and_store_news.js >> /var/log/news_cron.log 2>&1

# Trending y tweets a las 6:00 AM y 6:00 PM todos los días
0 6,18 * * * cd /path/to/NewsCron && node fetch_trending_and_tweets.js >> /var/log/trending_cron.log 2>&1

# Opcional: Limpiar logs viejos una vez por semana
0 0 * * 0 find /var/log -name "*_cron.log" -mtime +7 -delete
```

## Explicación del Horario de Trending

### ¿Por qué 6AM y 6PM?
- **6:00 AM**: Captura trending topics de la madrugada y primeras horas del día
- **6:00 PM**: Captura trending topics del día y inicio de la tarde/noche
- **Cobertura completa**: Con estos dos momentos se cubre bien la actividad diaria de trending topics

### Configuraciones Alternativas

#### Opción A: Solo en días laborales
```bash
# Noticias cada 30 minutos
*/30 * * * * cd /path/to/NewsCron && node fetch_and_store_news.js >> /var/log/news_cron.log 2>&1

# Trending solo lunes a viernes a las 6AM y 6PM
0 6,18 * * 1-5 cd /path/to/NewsCron && node fetch_trending_and_tweets.js >> /var/log/trending_cron.log 2>&1
```

#### Opción B: Horario extendido fines de semana
```bash
# Noticias cada 30 minutos
*/30 * * * * cd /path/to/NewsCron && node fetch_and_store_news.js >> /var/log/news_cron.log 2>&1

# Trending lunes a viernes 6AM y 6PM
0 6,18 * * 1-5 cd /path/to/NewsCron && node fetch_trending_and_tweets.js >> /var/log/trending_cron.log 2>&1

# Trending fines de semana a las 8AM, 2PM y 8PM
0 8,14,20 * * 6,7 cd /path/to/NewsCron && node fetch_trending_and_tweets.js >> /var/log/trending_cron.log 2>&1
```

## Ejecución Manual

### Probar noticias
```bash
cd NewsCron
node fetch_and_store_news.js
```

### Probar trending y tweets
```bash
cd NewsCron
node fetch_trending_and_tweets.js
```

## Monitoreo

### Ver logs en tiempo real
```bash
# Logs de noticias
tail -f /var/log/news_cron.log

# Logs de trending
tail -f /var/log/trending_cron.log
```

### Verificar estado del cron
```bash
# Ver crontab actual
crontab -l

# Ver logs del sistema cron
sudo journalctl -u cron -f
```

## Notas Importantes

1. **Rate Limiting**: El script de trending tiene pausas de 2 segundos entre requests para evitar sobrecargar la API
2. **Duplicados**: Ambos scripts verifican duplicados antes de insertar en la base de datos
3. **Error Handling**: Los scripts continúan ejecutándose aunque falle un item individual
4. **Logs**: Se recomienda rotar logs para evitar que crezcan demasiado

## Preparación

Antes de configurar los cron jobs:

1. **Ejecutar SQL**: Ejecutar `create_trending_tweets_table.sql` en Supabase
2. **Probar manualmente**: Ejecutar ambos scripts manualmente primero
3. **Verificar permisos**: Asegurar que el usuario tiene permisos de escritura en `/var/log`
4. **Configurar API**: Verificar que `https://api.standatpd.com` esté disponible 