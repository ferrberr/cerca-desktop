export const MODELS = Object.freeze({
  planner: 'cerca-planner:9b',
  decision: 'nimble:9b-q4_K_M',
  embedding: 'qwen3-embedding:0.6b',
});
export const OLLAMA_URL = 'http://127.0.0.1:11434';
export const MODEL_SOURCES = {
  planner: 'https://ollama.com/library/qwen3.5:9b',
  decision: 'https://ollama.com/library/nimble:9b-q4_K_M',
  embedding: 'https://ollama.com/library/qwen3-embedding:0.6b',
};

export const MODEL_LABELS={planner:'Qwen3.5 9B',decision:'Nimble 9B · Requisitos fijados',embedding:'Qwen3 Embedding 0.6B'};
