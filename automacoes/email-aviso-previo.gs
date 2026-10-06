/**
 * Gestão Hubs · Órion — e-mail automático de aviso prévio
 *
 * Cole este código no Google Apps Script (script.google.com) entrando com a conta
 * arthurrocha@orioncloudkitchens.com.br. Os e-mails saem dessa conta.
 *
 * Publicar: Implantar → Nova implantação → Tipo "App da Web"
 *   Executar como: Eu (arthurrocha@orioncloudkitchens.com.br)
 *   Quem pode acessar: Qualquer pessoa
 * Depois copie o URL do app da Web e cole em Gestão Hubs → Sistema → Configurações → Avisos por e-mail.
 *
 * Quem chama este endereço é o banco (Supabase), sempre que uma nova solicitação
 * de aviso prévio é cadastrada no CS. O endereço não aparece no site.
 */
function doPost(e) {
  const dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  const para = (dados.para || [])
    .map(function (x) { return String(x).trim(); })
    .filter(function (x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x); })
    .slice(0, 50);
  if (!para.length) return ContentService.createTextOutput('sem destinatários');

  const r = dados.registro || {};
  const assunto = (dados.teste ? '[TESTE] ' : '') + 'Novo aviso prévio: ' + (r.loja || 'loja não informada');
  MailApp.sendEmail({
    to: para.join(','),
    subject: assunto,
    htmlBody: corpo(r, dados.link, dados.teste),
    name: 'Órion · Gestão Hubs',
  });
  return ContentService.createTextOutput('ok');
}

function corpo(r, link, teste) {
  const linhas = [
    ['Loja', r.loja],
    ['Cliente', r.nome_cliente],
    ['Hub', r.hub],
    ['Modelo', r.modelo],
    ['Mensalidade fixa', dinheiro(r.mensalidade_fixa)],
    ['Taxa variável', r.taxa_variavel_rs ? dinheiro(r.taxa_variavel_rs) : (r.taxa_variavel != null ? r.taxa_variavel + '%' : '')],
    ['Faturamento mensal médio', dinheiro(r.faturamento_medio)],
    ['Data de solicitação', data(r.data_solicitacao)],
    ['Tempo de aviso prévio', r.aviso_previo_dias ? r.aviso_previo_dias + ' dias' : ''],
    ['Saída prevista', data(r.data_saida_prevista)],
    ['Reunião de A.P', r.reuniao_ap],
    ['Observações', r.observacoes],
  ].filter(function (l) { return l[1] !== undefined && l[1] !== null && l[1] !== ''; });

  const tabela = linhas.map(function (l) {
    return '<tr><td style="padding:8px 12px;color:#4a5a66;font-size:13px;white-space:nowrap;vertical-align:top">' + esc(l[0]) +
      '</td><td style="padding:8px 12px;color:#0f1f2a;font-size:14px;font-weight:600">' + esc(l[1]) + '</td></tr>';
  }).join('');

  return '<div style="font-family:Arial,Helvetica,sans-serif;background:#f2f4f6;padding:24px">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e8ec">' +
    '<div style="background:#0b3c52;color:#ffffff;padding:18px 24px">' +
    '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8fd6e6">Gestão Hubs · CS</div>' +
    '<div style="font-size:20px;font-weight:bold;margin-top:4px">' + (teste ? 'Teste: ' : '') + 'Novo cliente em aviso prévio</div></div>' +
    '<table style="width:100%;border-collapse:collapse;margin:8px 0">' + tabela + '</table>' +
    (link ? '<div style="padding:8px 24px 24px"><a href="' + esc(link) + '" style="display:inline-block;background:#0b3c52;color:#ffffff;' +
      'text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:bold;font-size:14px">Abrir no Gestão Hubs</a></div>' : '') +
    '</div><div style="text-align:center;color:#7b8a95;font-size:11px;margin-top:12px">E-mail automático do Gestão Hubs</div></div>';
}

function dinheiro(v) {
  if (v === undefined || v === null || v === '') return '';
  return 'R$ ' + Number(v).toFixed(2).replace('.', ',').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
}
function data(iso) {
  if (!iso) return '';
  const p = String(iso).slice(0, 10).split('-');
  return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(iso);
}
function esc(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
