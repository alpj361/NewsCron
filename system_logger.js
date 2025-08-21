import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

dotenv.config();

class SystemLogger {
    constructor() {
        // Usar las mismas credenciales del script principal
        const SUPABASE_URL = process.env.SUPABASE_URL || 'https://qqshdccpmypelhmyqnut.supabase.co';
        const SUPABASE_KEY = process.env.SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InFxc2hkY2NwbXlwZWxobXlxbnV0Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc0NjAzNjcxMSwiZXhwIjoyMDYxNjEyNzExfQ.BaJ_z3Gp2pUnmYEDpfNTCIxpHloSjmxi43aKwm-93ZI';
        
        this.supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
        
        this.currentLog = null;
        this.startTime = null;
        this.metrics = {
            trends_found: 0,
            tweets_found: 0,
            tweets_processed: 0,
            tweets_saved: 0,
            tweets_failed: 0,
            duplicates_skipped: 0,
            ai_requests_made: 0,
            ai_requests_successful: 0,
            ai_requests_failed: 0,
            total_tokens_used: 0,
            estimated_cost_usd: 0,
            categoria_stats: {},
            sentimiento_stats: {},
            intencion_stats: {},
            propagacion_stats: {},
            error_details: [],
            warnings: []
        };

        // Acumulado interno por modelo/proveedor (solo para guardar en metadata al finalizar)
        this._aiUsage = {
            total_requests: 0,
            total_tokens: 0,
            total_cost_usd: 0,
            models: {}
        };
    }

    async startExecution(scriptName, metadata = {}) {
        this.startTime = new Date();
        
        try {
            const { data, error } = await this.supabase
                .from('system_execution_logs')
                .insert({
                    script_name: scriptName,
                    started_at: this.startTime.toISOString(),
                    status: 'running',
                    metadata: metadata
                })
                .select()
                .single();

            if (error) {
                console.error('Error creando log de ejecución:', error);
                return null;
            }

            this.currentLog = data;
            console.log(`📊 Ejecución iniciada - ID: ${data.execution_id}`);
            return data.execution_id;
        } catch (error) {
            console.error('Error iniciando log de ejecución:', error);
            return null;
        }
    }

    incrementMetric(metricName, value = 1) {
        if (this.metrics.hasOwnProperty(metricName)) {
            this.metrics[metricName] += value;
        }
    }

    setMetric(metricName, value) {
        if (this.metrics.hasOwnProperty(metricName)) {
            this.metrics[metricName] = value;
        }
    }

    addError(error, context = '') {
        const errorDetail = {
            timestamp: new Date().toISOString(),
            error: error.message || error,
            context: context,
            stack: error.stack || ''
        };
        this.metrics.error_details.push(errorDetail);
        console.error(`❌ Error registrado: ${context}`, error);
    }

    addWarning(warning, context = '') {
        const warningDetail = {
            timestamp: new Date().toISOString(),
            warning: warning,
            context: context
        };
        this.metrics.warnings.push(warningDetail);
        console.warn(`⚠️ Warning: ${context} - ${warning}`);
    }

    updateCategoriaStats(categoria) {
        if (!this.metrics.categoria_stats[categoria]) {
            this.metrics.categoria_stats[categoria] = 0;
        }
        this.metrics.categoria_stats[categoria]++;
    }

    updateSentimientoStats(sentimiento) {
        if (!this.metrics.sentimiento_stats[sentimiento]) {
            this.metrics.sentimiento_stats[sentimiento] = 0;
        }
        this.metrics.sentimiento_stats[sentimiento]++;
    }

    updateIntencionStats(intencion) {
        if (!this.metrics.intencion_stats[intencion]) {
            this.metrics.intencion_stats[intencion] = 0;
        }
        this.metrics.intencion_stats[intencion]++;
    }

    updatePropagacionStats(propagacion) {
        if (!this.metrics.propagacion_stats[propagacion]) {
            this.metrics.propagacion_stats[propagacion] = 0;
        }
        this.metrics.propagacion_stats[propagacion]++;
    }

    addAIRequestCost(tokens, success = true) {
        // Compatibilidad hacia atrás: asume GPT-3.5-turbo $0.001 / 1K tokens
        this.addAIUsage({ tokens, success, model: 'gpt-3.5-turbo', provider: 'openai', costPer1K: 0.001 });
    }

    /**
     * Registra uso de IA con detalle de modelo y costo estimado.
     * options: { tokens: number, success?: boolean, model?: string, provider?: string, costPer1K?: number, costPer1M?: number, apiResponseTimeMs?: number }
     */
    addAIUsage(options = {}) {
        const {
            tokens = 0,
            success = true,
            model = 'unknown',
            provider = 'unknown',
            costPer1K,
            costPer1M,
            apiResponseTimeMs
        } = options;

        // Contadores generales
        this.incrementMetric('ai_requests_made');
        if (success) {
            this.incrementMetric('ai_requests_successful');
        } else {
            this.incrementMetric('ai_requests_failed');
        }
        this.incrementMetric('total_tokens_used', tokens);

        // Calcular costo por token a partir de costPer1K o costPer1M
        let costPerToken = 0;
        if (typeof costPer1M === 'number' && !Number.isNaN(costPer1M)) {
            costPerToken = costPer1M / 1_000_000;
        } else if (typeof costPer1K === 'number' && !Number.isNaN(costPer1K)) {
            costPerToken = costPer1K / 1_000;
        } else {
            // Fallback conservador (coincide con el comportamiento previo)
            costPerToken = 0.001 / 1000; // $0.001 por 1K tokens
        }

        const requestCost = tokens * costPerToken;
        this.metrics.estimated_cost_usd += requestCost;

        // Acumular desglose por modelo
        if (!this._aiUsage.models[model]) {
            this._aiUsage.models[model] = {
                provider,
                requests: 0,
                tokens: 0,
                cost_usd: 0
            };
        }
        this._aiUsage.models[model].requests += 1;
        this._aiUsage.models[model].tokens += tokens;
        this._aiUsage.models[model].cost_usd += requestCost;

        // Totales
        this._aiUsage.total_requests += 1;
        this._aiUsage.total_tokens += tokens;
        this._aiUsage.total_cost_usd += requestCost;

        // Guardar último request (útil en depuración)
        if (apiResponseTimeMs !== undefined) {
            this._aiUsage.last_request_ms = apiResponseTimeMs;
        }
    }

    async updateExecution(status = 'running') {
        if (!this.currentLog) return;

        try {
            const now = new Date();
            const duration = Math.floor((now - this.startTime) / 1000);
            
            const updateData = {
                ...this.metrics,
                status: status,
                duration_seconds: duration,
                updated_at: now.toISOString()
            };

            if (status === 'completed' || status === 'failed') {
                updateData.completed_at = now.toISOString();
            }

            const { error } = await this.supabase
                .from('system_execution_logs')
                .update(updateData)
                .eq('id', this.currentLog.id);

            if (error) {
                console.error('Error actualizando log:', error);
            }
        } catch (error) {
            console.error('Error en updateExecution:', error);
        }
    }

    async finishExecution(status = 'completed', finalMetadata = {}) {
        if (!this.currentLog) return;

        try {
            const endTime = new Date();
            const duration = Math.floor((endTime - this.startTime) / 1000);
            
            const finalData = {
                ...this.metrics,
                status: status,
                completed_at: endTime.toISOString(),
                duration_seconds: duration,
                metadata: { 
                    ...this.currentLog.metadata, 
                    ...finalMetadata,
                    ai_usage: this._aiUsage
                }
            };

            const { error } = await this.supabase
                .from('system_execution_logs')
                .update(finalData)
                .eq('id', this.currentLog.id);

            if (error) {
                console.error('Error finalizando log:', error);
            } else {
                console.log(`✅ Ejecución finalizada - Status: ${status}`);
                console.log(`📊 Resumen:`);
                console.log(`   - Duración: ${duration}s`);
                console.log(`   - Tweets procesados: ${this.metrics.tweets_processed}`);
                console.log(`   - Tweets guardados: ${this.metrics.tweets_saved}`);
                console.log(`   - Requests IA: ${this.metrics.ai_requests_made}`);
                console.log(`   - Costo estimado: $${this.metrics.estimated_cost_usd.toFixed(6)}`);
                console.log(`   - Errores: ${this.metrics.error_details.length}`);
            }
        } catch (error) {
            console.error('Error finalizando ejecución:', error);
        }
    }

    logProgress(message) {
        console.log(`🔄 ${new Date().toISOString()} - ${message}`);
    }

    logSuccess(message) {
        console.log(`✅ ${new Date().toISOString()} - ${message}`);
    }

    getExecutionSummary() {
        const duration = this.startTime ? Math.floor((new Date() - this.startTime) / 1000) : 0;
        return {
            execution_id: this.currentLog?.execution_id,
            duration_seconds: duration,
            ...this.metrics
        };
    }
}

export { SystemLogger }; 