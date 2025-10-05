# 🎨 Plan de División de Deportes en Frontend (ThePulse)

## 📋 Resumen

Este documento detalla cómo actualizar el frontend de ThePulse para separar trends deportivos de trends generales, aplicando la división tanto en el **About** como en el **Listado** de trends.

## 🎯 Objetivos de UX

### Principios de Diseño
1. **Separación visual clara** entre deportes y trends generales
2. **Navegación intuitiva** con tabs/pestañas
3. **Información contextual** sobre el balanceo aplicado
4. **Métricas visibles** de distribución deportes/no-deportes
5. **Responsive** y accesible (WCAG 2.1)

## 📍 Archivos a Modificar en ThePulse

### Componentes Principales
```
ThePulse/src/
├── components/
│   ├── trends/
│   │   ├── TrendsAbout.tsx          ← Modificar
│   │   ├── TrendsList.tsx           ← Modificar
│   │   ├── TrendsStats.tsx          ← Crear nuevo
│   │   ├── SportsTrendsSection.tsx  ← Crear nuevo
│   │   └── GeneralTrendsSection.tsx ← Crear nuevo
│   └── ui/
│       ├── Tabs.tsx                 ← Usar existente o crear
│       └── Badge.tsx                ← Para categorías
├── hooks/
│   └── useTrends.ts                 ← Modificar
└── types/
    └── trends.ts                    ← Actualizar tipos
```

## 🔧 Implementación Detallada

### 1. Actualizar Tipos TypeScript

**Archivo**: `ThePulse/src/types/trends.ts`

```typescript
// Agregar nuevos campos a la interfaz Trend
export interface Trend {
  id: string;
  timestamp: string;
  created_at: string;
  word_cloud_data: WordCloudItem[];
  top_keywords: Keyword[];
  category_data: CategoryItem[];
  about?: string[];
  statistics?: TrendStatistics;
  processing_status: string;
  
  // ====== NUEVOS CAMPOS ======
  is_deportes: boolean;
  categoria_principal: 'Deportes' | 'Política' | 'Económica' | 'Seguridad' | 'Sociales' | 'Entretenimiento' | 'General';
  // ===========================
  
  raw_data?: any;
  controversy_analyses?: any;
  controversy_statistics?: any;
  controversy_chart_data?: any;
}

// Nuevos tipos para estadísticas
export interface TrendsDistribution {
  total: number;
  deportivos: number;
  no_deportivos: number;
  porcentaje_deportes: number;
  breakdown_by_category: {
    [key: string]: number;
  };
}
```

### 2. Actualizar Hook de Trends

**Archivo**: `ThePulse/src/hooks/useTrends.ts`

```typescript
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/config/supabase';

export function useTrends(filterSports?: boolean) {
  return useQuery({
    queryKey: ['trends', filterSports],
    queryFn: async () => {
      let query = supabase
        .from('trends')
        .select('*')
        .order('created_at', { ascending: false });
      
      // Filtrar por deportes si se especifica
      if (filterSports !== undefined) {
        query = query.eq('is_deportes', filterSports);
      }
      
      const { data, error } = await query.limit(20);
      
      if (error) throw error;
      return data as Trend[];
    },
    staleTime: 5 * 60 * 1000, // 5 minutos
  });
}

export function useTrendsDistribution() {
  return useQuery({
    queryKey: ['trends-distribution'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('trends_distribution_stats')
        .select('*')
        .gte('fecha', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())
        .order('fecha', { ascending: false });
      
      if (error) throw error;
      return data;
    },
  });
}

export function useLatestTrendsByCategory() {
  return useQuery({
    queryKey: ['trends-latest-by-category'],
    queryFn: async () => {
      // Obtener el trend más reciente
      const { data: latest, error: latestError } = await supabase
        .from('trends')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      
      if (latestError) throw latestError;
      
      return {
        latest: latest,
        is_deportes: latest.is_deportes,
        categoria: latest.categoria_principal
      };
    },
  });
}
```

### 3. Crear Componente de Estadísticas

**Archivo**: `ThePulse/src/components/trends/TrendsStats.tsx` (NUEVO)

```typescript
import React from 'react';
import { useTrendsDistribution } from '@/hooks/useTrends';

interface TrendsStatsProps {
  compact?: boolean;
}

export function TrendsStats({ compact = false }: TrendsStatsProps) {
  const { data: distribution, isLoading } = useTrendsDistribution();
  
  if (isLoading) return <div>Cargando estadísticas...</div>;
  if (!distribution || distribution.length === 0) return null;
  
  // Calcular totales de los últimos 7 días
  const totals = distribution.reduce((acc, day) => {
    acc.total += day.total_trends;
    if (day.is_deportes) {
      acc.deportivos += day.total_trends;
    } else {
      acc.no_deportivos += day.total_trends;
    }
    return acc;
  }, { total: 0, deportivos: 0, no_deportivos: 0 });
  
  const porcentajeDeportes = Math.round((totals.deportivos / totals.total) * 100);
  
  if (compact) {
    return (
      <div className="flex items-center gap-4 text-sm">
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">Deportes:</span>
          <span className="font-medium">{porcentajeDeportes}%</span>
        </span>
        <span className="flex items-center gap-2">
          <span className="text-muted-foreground">General:</span>
          <span className="font-medium">{100 - porcentajeDeportes}%</span>
        </span>
      </div>
    );
  }
  
  return (
    <div className="grid grid-cols-3 gap-4 p-4 bg-secondary/10 rounded-lg">
      <div className="text-center">
        <div className="text-2xl font-bold">{totals.total}</div>
        <div className="text-sm text-muted-foreground">Total (7 días)</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-blue-600">{totals.deportivos}</div>
        <div className="text-sm text-muted-foreground">⚽ Deportes ({porcentajeDeportes}%)</div>
      </div>
      <div className="text-center">
        <div className="text-2xl font-bold text-purple-600">{totals.no_deportivos}</div>
        <div className="text-sm text-muted-foreground">📰 General ({100 - porcentajeDeportes}%)</div>
      </div>
    </div>
  );
}
```

### 4. Actualizar TrendsAbout con División

**Archivo**: `ThePulse/src/components/trends/TrendsAbout.tsx`

**Estructura Propuesta**:

```typescript
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { TrendsStats } from './TrendsStats';
import { useTrends } from '@/hooks/useTrends';

export function TrendsAbout() {
  const [activeTab, setActiveTab] = useState<'all' | 'general' | 'deportes'>('all');
  
  // Consultas separadas
  const { data: allTrends } = useTrends();
  const { data: generalTrends } = useTrends(false); // is_deportes = false
  const { data: sportsTrends } = useTrends(true);   // is_deportes = true
  
  return (
    <div className="space-y-6">
      {/* Header con estadísticas */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">About Trends</h2>
        <TrendsStats compact />
      </div>
      
      {/* Tabs de navegación */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="all">
            Todos ({allTrends?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="general">
            📰 General ({generalTrends?.length || 0})
          </TabsTrigger>
          <TabsTrigger value="deportes">
            ⚽ Deportes ({sportsTrends?.length || 0})
          </TabsTrigger>
        </TabsList>
        
        {/* Contenido por tab */}
        <TabsContent value="all">
          <TrendAboutContent trends={allTrends} showCategory />
        </TabsContent>
        
        <TabsContent value="general">
          <TrendAboutContent trends={generalTrends} type="general" />
        </TabsContent>
        
        <TabsContent value="deportes">
          <TrendAboutContent trends={sportsTrends} type="deportes" />
        </TabsContent>
      </Tabs>
    </div>
  );
}

// Componente auxiliar para renderizar el contenido
function TrendAboutContent({ 
  trends, 
  type, 
  showCategory = false 
}: { 
  trends?: Trend[];
  type?: 'general' | 'deportes';
  showCategory?: boolean;
}) {
  if (!trends || trends.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        No hay trends disponibles en esta categoría
      </div>
    );
  }
  
  // Renderizar word clouds, keywords, etc.
  return (
    <div className="space-y-6">
      {/* Aquí va el contenido existente de about trends */}
      {/* Agregar badges de categoría si showCategory es true */}
    </div>
  );
}
```

### 5. Actualizar TrendsList con Separación

**Archivo**: `ThePulse/src/components/trends/TrendsList.tsx`

**Estructura Propuesta**:

```typescript
import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Badge } from '@/components/ui/Badge';
import { useTrends } from '@/hooks/useTrends';

export function TrendsList() {
  const [activeTab, setActiveTab] = useState<'all' | 'general' | 'deportes'>('general');
  
  const { data: allTrends, isLoading: allLoading } = useTrends();
  const { data: generalTrends, isLoading: generalLoading } = useTrends(false);
  const { data: sportsTrends, isLoading: sportsLoading } = useTrends(true);
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold">Trending Topics</h2>
        <div className="text-sm text-muted-foreground">
          Balance: 10 general / 5 deportes
        </div>
      </div>
      
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="general">
            📰 General
          </TabsTrigger>
          <TabsTrigger value="deportes">
            ⚽ Deportes
          </TabsTrigger>
          <TabsTrigger value="all">
            Todos
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="general">
          <TrendListContent 
            trends={generalTrends} 
            isLoading={generalLoading}
            emptyMessage="No hay trends generales disponibles"
          />
        </TabsContent>
        
        <TabsContent value="deportes">
          <TrendListContent 
            trends={sportsTrends} 
            isLoading={sportsLoading}
            emptyMessage="No hay trends deportivos disponibles"
          />
        </TabsContent>
        
        <TabsContent value="all">
          <TrendListContent 
            trends={allTrends} 
            isLoading={allLoading}
            showCategory
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function TrendListContent({ 
  trends, 
  isLoading, 
  showCategory = false,
  emptyMessage = "No hay trends disponibles"
}: {
  trends?: Trend[];
  isLoading: boolean;
  showCategory?: boolean;
  emptyMessage?: string;
}) {
  if (isLoading) {
    return <div>Cargando trends...</div>;
  }
  
  if (!trends || trends.length === 0) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        {emptyMessage}
      </div>
    );
  }
  
  return (
    <div className="grid gap-4">
      {trends.map((trend) => (
        <div key={trend.id} className="p-4 border rounded-lg hover:bg-secondary/10">
          <div className="flex items-start justify-between">
            <div className="flex-1">
              <h3 className="font-semibold">
                {trend.timestamp ? new Date(trend.timestamp).toLocaleDateString() : 'N/A'}
              </h3>
              {showCategory && (
                <Badge variant={trend.is_deportes ? "blue" : "purple"}>
                  {trend.is_deportes ? '⚽' : '📰'} {trend.categoria_principal}
                </Badge>
              )}
            </div>
            <button className="text-sm text-primary">Ver detalles →</button>
          </div>
          
          {/* Renderizar word cloud preview, keywords, etc. */}
        </div>
      ))}
    </div>
  );
}
```

## 🎨 Mejoras de UI/UX

### Badges de Categoría

```typescript
// Colores por categoría
const categoryColors = {
  'Deportes': 'blue',
  'Política': 'red',
  'Económica': 'green',
  'Seguridad': 'yellow',
  'Sociales': 'purple',
  'Entretenimiento': 'pink',
  'General': 'gray'
};

// Íconos por categoría
const categoryIcons = {
  'Deportes': '⚽',
  'Política': '🏛️',
  'Económica': '💰',
  'Seguridad': '🚔',
  'Sociales': '👥',
  'Entretenimiento': '🎭',
  'General': '📰'
};
```

### Indicadores Visuales

```typescript
// Mostrar proporción en el header
<div className="flex items-center gap-2">
  <div className="h-2 flex rounded-full overflow-hidden w-48">
    <div 
      className="bg-purple-500" 
      style={{ width: `${noDeportivosPercentage}%` }}
      title={`General: ${noDeportivosPercentage}%`}
    />
    <div 
      className="bg-blue-500" 
      style={{ width: `${deportivosPercentage}%` }}
      title={`Deportes: ${deportivosPercentage}%`}
    />
  </div>
  <span className="text-xs text-muted-foreground">
    {noDeportivos} general / {deportivos} deportes
  </span>
</div>
```

## 📱 Responsive Design

### Mobile First
```typescript
// En mobile: stack vertical de tabs
<TabsList className="flex flex-col sm:flex-row w-full">
  {/* tabs */}
</TabsList>

// En mobile: lista simple
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
  {/* trends cards */}
</div>
```

## ♿ Accesibilidad

### ARIA Labels
```typescript
<Tabs 
  aria-label="Filtrar trends por categoría"
  value={activeTab}
>
  <TabsTrigger 
    value="general"
    aria-label="Ver trends generales"
  >
    General
  </TabsTrigger>
</Tabs>
```

### Keyboard Navigation
- Tab entre secciones
- Enter para seleccionar
- Escape para cerrar modales

## 🧪 Testing

### Tests Unitarios
```typescript
describe('TrendsList with Sports Filter', () => {
  it('should filter sports trends correctly', () => {
    // Test
  });
  
  it('should show correct distribution percentages', () => {
    // Test
  });
  
  it('should switch tabs correctly', () => {
    // Test
  });
});
```

### Tests de Integración
```typescript
describe('Trends Integration', () => {
  it('should fetch and display sports/general trends separately', async () => {
    // Test
  });
});
```

## 📊 KPIs a Monitorear

1. **CTR por sección**: General vs Deportes
2. **Tiempo en cada tab**: ¿Cuál prefieren los usuarios?
3. **Bounce rate**: ¿La división reduce el rebote?
4. **Engagement**: Interacciones con trends deportivos vs generales

## 🚀 Plan de Rollout

### Fase 1: Backend Ready
- ✅ SQL migration ejecutada
- ✅ NewsCron balanceando trends
- ✅ ExtractorW guardando campos

### Fase 2: Frontend Development
1. Actualizar tipos TypeScript
2. Crear hooks de consulta
3. Implementar componentes UI
4. Testing local

### Fase 3: Staging
1. Deploy a staging
2. Smoke tests
3. UAT con usuarios beta

### Fase 4: Production
1. Feature flag activado
2. Monitoreo de métricas
3. A/B testing si es necesario

---

**Próximos Pasos**: Una vez implementado esto, tendrás un sistema completo de balanceo de deportes con separación visual clara en el frontend.
