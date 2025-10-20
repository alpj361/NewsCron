# 🚀 GUÍA DE DEPLOYMENT - VPS Production

## 🎯 **Respuesta a tu pregunta:**

**✅ SÍ, localhost puede seguir funcionando en Docker**, pero la **mejor práctica** es usar el nombre del servicio en Docker Compose.

## 🐳 **Configuraciones por Escenario:**

### **📍 DESARROLLO LOCAL**
```bash
LAURA_MEMORY_URL=http://localhost:5001
```

### **📍 VPS - DOCKER COMPOSE (Recomendado)**
```bash
LAURA_MEMORY_URL=http://laura-memory:5001  # Nombre del servicio
```

### **📍 VPS - CONTENEDOR ÚNICO**
```bash
LAURA_MEMORY_URL=http://localhost:5001     # Ambos en mismo contenedor
```

### **📍 VPS - MÁQUINAS SEPARADAS**
```bash
LAURA_MEMORY_URL=http://IP_LAURA_MEMORY:5001
```

## 🔧 **Setup para tu VPS:**

### **1. Archivo de Variables de Entorno**
Crea `.env.production`:
```bash
# Laura Memory Service
LAURA_MEMORY_URL=http://laura-memory:5001
LAURA_MEMORY_ENABLED=true

# Zep Configuration
ZEP_API_KEY=tu_zep_api_key
ZEP_PROJECT_ID=tu_zep_project_id

# Supabase Configuration
SUPABASE_URL=https://tu-proyecto.supabase.co
SUPABASE_KEY=tu_supabase_anon_key

# Gemini AI Configuration  
GEMINI_API_KEY=tu_gemini_api_key
```

### **2. Deploy en VPS**
```bash
# 1. Subir archivos al VPS
scp -r NewsCron/ user@tu-vps:/home/user/pulse/
scp -r LauraMemoryService/ user@tu-vps:/home/user/pulse/

# 2. En el VPS
cd /home/user/pulse/NewsCron
cp .env.production .env

# 3. Ejecutar con Docker Compose
docker-compose -f docker-compose.production.yml up -d

# 4. Verificar logs
docker-compose logs -f laura-memory
docker-compose logs -f news-cron
```

## ✅ **Ventajas de cada opción:**

### **🎯 OPCIÓN RECOMENDADA: Docker Compose**
```yaml
# docker-compose.production.yml ya creado ✅
services:
  laura-memory:
    ports: ["5001:5001"]
  news-cron:
    environment:
      - LAURA_MEMORY_URL=http://laura-memory:5001  # Usa nombre del servicio
```

**Ventajas:**
- ✅ **Aislamiento**: Cada servicio en su contenedor
- ✅ **Escalabilidad**: Fácil escalar servicios independientemente  
- ✅ **Mantenimiento**: Actualizar servicios por separado
- ✅ **Networking**: Docker maneja la red automáticamente
- ✅ **Health checks**: Verifica que servicios estén funcionando

### **🔧 ALTERNATIVA: Contenedor Único**
Si prefieres simplicidad:
```dockerfile
FROM node:18
COPY LauraMemoryService/ /app/memory/
COPY NewsCron/ /app/cron/
# Ejecutar ambos servicios en el mismo contenedor
```

**Ventajas:**
- ✅ **Simplicidad**: Un solo contenedor
- ✅ **localhost funciona**: Sin configuración de red
- ✅ **Menos overhead**: Menor uso de recursos

## 🚨 **Consideraciones importantes:**

### **🔒 Seguridad en VPS**
```yaml
# En producción, no exponer puerto 5001 externamente
ports:
  - "127.0.0.1:5001:5001"  # Solo localhost del VPS
# O no poner ports si solo se usa internamente
```

### **📊 Monitoreo**
```bash
# Ver logs en tiempo real
docker-compose logs -f

# Verificar estado de servicios
docker-compose ps

# Reiniciar servicios
docker-compose restart laura-memory
docker-compose restart news-cron
```

### **⚡ Performance**
```yaml
# Límites de recursos
deploy:
  resources:
    limits:
      memory: 512M
      cpus: '0.5'
```

## 🎯 **Conclusión:**

**✅ Para tu VPS, recomiendo usar Docker Compose** con:
- `LAURA_MEMORY_URL=http://laura-memory:5001`
- Servicios separados pero en la misma red Docker
- Health checks y restart policies
- Logs centralizados

**🚀 ¿Por qué NO usar localhost en VPS?**
- Más flexible para futuro scaling
- Mejor aislamiento de servicios  
- Fácil debugging independiente
- Preparado para microservicios

**¿Prefieres la opción Docker Compose o el contenedor único?** 🤔 