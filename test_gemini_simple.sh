#!/bin/bash

# Prueba simple de la API de Gemini
# Uso: ./test_gemini_simple.sh "tu_api_key_aqui"

API_KEY=${1:-$GEMINI_API_KEY}

if [ -z "$API_KEY" ]; then
    echo "❌ Uso: ./test_gemini_simple.sh tu_api_key_aqui"
    echo "O configura GEMINI_API_KEY en tu .env"
    exit 1
fi

echo "🧪 Prueba rápida de Gemini API..."

curl -H 'Content-Type: application/json' \
     -d '{
       "contents": [
         {
           "parts": [
             {
               "text": "Analiza el sentimiento de este tweet: Me gusta la nueva política del presidente Arévalo. Responde con JSON: {sentimiento: positivo, score: 0.8}"
             }
           ]
         }
       ]
     }' \
     "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=$API_KEY"

echo ""
echo "🏁 Prueba completada." 