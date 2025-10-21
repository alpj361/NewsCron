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
        this.incrementMetric('ai_requests_made');
        if (success) {
            this.incrementMetric('ai_requests_successful');
        } else {
            this.incrementMetric('ai_requests_failed');
        }
        
        this.incrementMetric('total_tokens_used', tokens);
        
        // Costo estimado: $0.001 / 1000 tokens para GPT-3.5-turbo
        const costPerToken = 0.001 / 1000;
        const requestCost = tokens * costPerToken;
        this.metrics.estimated_cost_usd += requestCost;
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
                metadata: { ...this.currentLog.metadata, ...finalMetadata }
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