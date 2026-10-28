// Configuração geral do sistema.
// Preencha supabaseUrl e supabaseAnonKey para que os dados fiquem salvos na nuvem
// e sejam compartilhados entre todos os usuários (veja o README).
// Deixando em branco, o sistema funciona em modo local (dados apenas neste navegador).
window.APP_CONFIG = {
  appName: 'Gestão Hubs',
  supabaseUrl: 'https://gmkazwyddaptsjapuxri.supabase.co',
  supabaseAnonKey: 'sb_publishable_CY6lKEx7BmmMU_oSKvW3Vg_obo09xXM',
  hubs: ['Savassi', 'Cidade Nova', 'Castelo', 'Buritis'],
  // Faturamento mensal médio da empresa, base do cálculo de churn (pode ser alterado em Configurações)
  faturamentoMensalBase: 120000,
};
