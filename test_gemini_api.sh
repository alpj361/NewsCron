#!/bin/bash

# Script para probar la API de Gemini antes de implementarla
# Asegúrate de tener tu GEMINI_API_KEY configurada

# Cargar variables de entorno si existe .env
if [ -f .env ]; then
    export $(cat .env | grep -v '#' | xargs)
fi

# Verificar que la API key esté configurada
if [ -z "$GEMINI_API_KEY" ]; then
    echo "❌ Error: GEMINI_API_KEY no está configurada"
    echo "Agrega GEMINI_API_KEY=tu_api_key_aqui a tu archivo .env"
    exit 1
fi

echo "🧪 Probando API de Gemini..."
echo "🔑 API Key: ${GEMINI_API_KEY:0:20}..."

# Tweet de prueba
TWEET_TEXTO="El presidente Arévalo anunció nuevas medidas económicas para fortalecer el quetzal"
CATEGORIA="Política"

# Crear el prompt de prueba
PROMPT="Analiza COMPLETAMENTE este tweet guatemalteco de la categoría \"$CATEGORIA\":

Tweet: \"$TWEET_TEXTO\"

Contexto:
- Usuario: @test_user
- Categoría: $CATEGORIA
- Ubicación: Guatemala
- Fecha: $(date)
- Likes: 10, Retweets: 5, Replies: 3

Instrucciones de Análisis:
1. SENTIMIENTO: Considera contexto guatemalteco, lenguaje chapín, sarcasmo, ironía
2. INTENCIÓN: Identifica el propósito comunicativo del tweet
3. ENTIDADES: Extrae personas, organizaciones, lugares, eventos mencionados

Responde ÚNICAMENTE con un JSON válido:
{
  \"sentimiento\": \"positivo|negativo|neutral\",
  \"score\": 0.75,
  \"confianza\": 0.85,
  \"emociones\": [\"alegría\", \"esperanza\"],
  \"intencion_comunicativa\": \"informativo|opinativo|humoristico|alarmista|critico|promocional|conversacional|protesta\",
  \"entidades_mencionadas\": [
    {
      \"nombre\": \"Bernardo Arévalo\",
      \"tipo\": \"persona\",
      \"contexto\": \"presidente de Guatemala\"
    }
  ],
  \"contexto_local\": \"breve explicación del contexto guatemalteco detectado\",
  \"intensidad\": \"alta|media|baja\"
}"

# Crear archivo temporal con el JSON request
cat > /tmp/gemini_request.json << EOF
{
  "contents": [
    {
      "parts": [
        {
          "text": "$PROMPT"
        }
      ]
    }
  ],
  "generationConfig": {
    "temperature": 0.3,
    "topK": 1,
    "topP": 1,
    "maxOutputTokens": 300,
    "stopSequences": []
  },
  "safetySettings": [
    {
      "category": "HARM_CATEGORY_HARASSMENT",
      "threshold": "BLOCK_MEDIUM_AND_ABOVE"
    }
  ]
}
EOF

echo "📤 Enviando request a Gemini API..."

# Hacer la llamada a la API de Gemini (URL correcta)
RESPONSE=$(curl -s -w "HTTPSTATUS:%{http_code}" \
  -H "Content-Type: application/json" \
  -d @/tmp/gemini_request.json \
  "https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=$GEMINI_API_KEY")

# Separar el código HTTP del cuerpo de la respuesta
HTTP_STATUS=$(echo $RESPONSE | tr -d '\n' | sed -e 's/.*HTTPSTATUS://')
RESPONSE_BODY=$(echo $RESPONSE | sed -e 's/HTTPSTATUS:.*//g')

echo "📡 HTTP Status: $HTTP_STATUS"

if [ "$HTTP_STATUS" -eq 200 ]; then
    echo "✅ API de Gemini funcionando correctamente!"
    echo ""
    echo "📋 Respuesta completa:"
    echo "$RESPONSE_BODY" | jq '.'
    echo ""
    
    # Intentar extraer el contenido de texto
    CONTENT=$(echo "$RESPONSE_BODY" | jq -r '.candidates[0].content.parts[0].text' 2>/dev/null)
    
    if [ "$CONTENT" != "null" ] && [ "$CONTENT" != "" ]; then
        echo "📝 Contenido extraído:"
        echo "$CONTENT"
        echo ""
        
        # Intentar parsear como JSON
        echo "🔍 Verificando si es JSON válido..."
        CLEAN_CONTENT=$(echo "$CONTENT" | sed 's/```json//g' | sed 's/```//g')
        echo "$CLEAN_CONTENT" | jq '.' > /dev/null 2>&1
        
        if [ $? -eq 0 ]; then
            echo "✅ JSON válido recibido!"
            echo "$CLEAN_CONTENT" | jq '.'
        else
            echo "⚠️  La respuesta no es JSON válido. Contenido:"
            echo "$CLEAN_CONTENT"
        fi
    else
        echo "❌ No se pudo extraer contenido de la respuesta"
    fi
else
    echo "❌ Error en la API de Gemini (HTTP $HTTP_STATUS)"
    echo "📋 Respuesta de error:"
    echo "$RESPONSE_BODY" | jq '.' 2>/dev/null || echo "$RESPONSE_BODY"
    
    # Sugerir posibles soluciones
    echo ""
    echo "🔧 Posibles soluciones:"
    echo "1. Verifica que tu GEMINI_API_KEY sea correcta"
    echo "2. Asegúrate de que la API esté habilitada en Google Cloud Console"
    echo "3. Verifica que tengas créditos/cuota disponible"
    echo "4. URL de configuración: https://aistudio.google.com/apikey"
fi

# Limpiar archivos temporales
rm -f /tmp/gemini_request.json

echo ""
echo "🏁 Prueba completada." 