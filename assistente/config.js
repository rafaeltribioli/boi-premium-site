/*
 * Configuração pública dos assistentes (nada secreto aqui — chaves de API NUNCA entram neste arquivo).
 * - whatsapp: número que recebe pedidos e cotações
 * - clipeFraldinha: caminho de um vídeo curto da fraldinha na brasa (ex.: 'assistente/img/fraldinha-brasa.mp4').
 *   Enquanto for null, aparece a foto real com aproximação suave.
 * - videoAvatar: reservado para o vídeo falante com sincronização labial (ver assistente/LEIA-ASSISTENTES.md).
 */
window.BOI_ASSISTENTES = {
  whatsapp: '5519993497099',
  clipeFraldinha: null,
  videoAvatar: { ativo: false, endpointSessao: null }
};
