# Documentação Técnica de Integração com API Externa

## Visão Geral
O **DetectorIA** consome a API Inference da HuggingFace (`roberta-base-openai-detector`) para complementar a análise estocástica e de entropia realizada localmente.

## Detalhes da Integração
- **Endpoint Externo:** `https://api-inference.huggingface.co/models/roberta-base-openai-detector`
- **Método HTTP:** `POST`
- **Headers:** `Content-Type: application/json`
- **Payload Enviado:** `{"inputs": "<primeiros_500_caracteres_do_texto>"}`
- **Tratamento de Exceção / Resiliência:** Caso a API externa atinja o tempo limite (timeout de 3s) ou retorne erro HTTP, a aplicação executa o *fallback* gracioso mantendo o cálculo das métricas PLN locais (Perplexidade e Burstiness) sem interromper a experiência do usuário.