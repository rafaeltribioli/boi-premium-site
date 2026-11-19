// Configuração PÚBLICA do site (nada secreto aqui).
// endpoint: endereço do serviço de IA (Cloudflare Worker) depois de publicado,
//   ex.: 'https://boi-premium-assistente.SEU-SUBDOMINIO.workers.dev'
// Enquanto estiver vazio, o site mostra "Assistente com IA temporariamente indisponível"
// e oferece a calculadora identificada como SEM IA.
window.BOI_CONFIG = {
  whatsapp: '5519993497099',
  atendimento: '08h às 19h',
  assistente: {
    endpoint: 'https://boi-premium-assistente.rafaeltribioli.workers.dev',
    timeoutMs: 22000
  }
};
