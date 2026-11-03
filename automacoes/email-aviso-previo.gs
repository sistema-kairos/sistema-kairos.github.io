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
 * Quem chama este endereço é o banco (Supabase):
 *   - sempre que uma nova solicitação de aviso prévio é cadastrada no CS;
 *   - quando um cliente atinge um milestone (tipo 'milestone', aba CS → Milestones);
 *   - para ler a planilha "Faturamento Mensal" (tipo 'importar_faturamento', aba CS → Faturamento dos clientes):
 *     nos dias 3 e 16 de cada mês e no botão "Importar agora". O script lê as abas "Cobrança MM/AAAA"
 *     e devolve ao banco pela função importar_faturamento, com um código de uso único que o próprio banco gerou.
 *     A conta que executa o script precisa ter acesso à planilha.
 * O endereço não aparece no site.
 *
 * Atualizar sem trocar o endereço: Implantar → Gerenciar implantações → lápis (editar) → Versão: "Nova versão" → Implantar.
 */
function doPost(e) {
  const dados = JSON.parse((e && e.postData && e.postData.contents) || '{}');
  if (dados.tipo === 'importar_faturamento') return importarFaturamento(dados.codigo);
  const para = (dados.para || [])
    .map(function (x) { return String(x).trim(); })
    .filter(function (x) { return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(x); })
    .slice(0, 50);
  if (!para.length) return ContentService.createTextOutput('sem destinatários');
  if (dados.tipo === 'milestone') return enviarMilestones(para, dados);

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

// ---------- milestones dos clientes ----------
function enviarMilestones(para, dados) {
  const itens = (dados.itens || []).slice(0, 50);
  if (!itens.length) return ContentService.createTextOutput('sem itens');
  const assunto = itens.length === 1
    ? 'Milestone: ' + (itens[0].loja || 'cliente') + ' · ' + itens[0].rotulo
    : itens.length + ' clientes atingiram milestones';
  const linhas = itens.map(function (m) {
    return '<tr><td style="padding:12px 24px;border-top:1px solid #e3e8ec">' +
      '<div style="font-size:16px;font-weight:bold;color:#0f1f2a">' + esc(m.rotulo) + '</div>' +
      '<div style="font-size:14px;color:#4a5a66;margin-top:2px">' + esc([m.loja, m.cliente, m.hub].filter(Boolean).join(' · ')) + '</div>' +
      '<div style="font-size:12px;color:#7b8a95;margin-top:2px">Atingido em ' + data(m.data) + '</div></td></tr>';
  }).join('');
  const html = '<div style="font-family:Arial,Helvetica,sans-serif;background:#f2f4f6;padding:24px">' +
    '<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:16px;overflow:hidden;border:1px solid #e3e8ec">' +
    '<div style="background:#0b3c52;color:#ffffff;padding:18px 24px">' +
    '<div style="font-size:12px;letter-spacing:2px;text-transform:uppercase;color:#8fd6e6">Gestão Hubs · CS · Milestones</div>' +
    '<div style="font-size:20px;font-weight:bold;margin-top:4px">' + (itens.length === 1 ? 'Um cliente atingiu um milestone' : itens.length + ' clientes atingiram milestones') + '</div></div>' +
    '<p style="padding:16px 24px 4px;margin:0;font-size:14px;color:#0f1f2a">Hora de celebrar a conquista com o cliente. Depois da ação, marque como celebrado no Gestão Hubs.</p>' +
    '<table style="width:100%;border-collapse:collapse;margin:8px 0">' + linhas + '</table>' +
    (dados.link ? '<div style="padding:8px 24px 24px"><a href="' + esc(dados.link) + '" style="display:inline-block;background:#0b3c52;color:#ffffff;' +
      'text-decoration:none;padding:10px 20px;border-radius:999px;font-weight:bold;font-size:14px">Abrir Milestones</a></div>' : '') +
    '</div><div style="text-align:center;color:#7b8a95;font-size:11px;margin-top:12px">E-mail automático do Gestão Hubs</div></div>';
  MailApp.sendEmail({ to: para.join(','), subject: assunto, htmlBody: html, name: 'Órion · Gestão Hubs' });
  return ContentService.createTextOutput('ok');
}

// ---------- planilha Faturamento Mensal → Gestão Hubs (CS → Faturamento dos clientes) ----------
const PLANILHA_FATURAMENTO = '1SzVGG4fChAwRmdSl10TBQM2TFNBkY1pqmXGbCB9Rszk';
const SUPABASE_URL = 'https://gmkazwyddaptsjapuxri.supabase.co';
const SUPABASE_CHAVE = 'sb_publishable_CY6lKEx7BmmMU_oSKvW3Vg_obo09xXM'; // chave pública (a mesma do config.js do site)
const MESES_FATURAMENTO = 14; // quantos meses (abas) mais recentes enviar
const HUB_POR_NUMERO = { 1: 'Savassi', 2: 'Cidade Nova', 3: 'Buritis', 4: 'Castelo' };

// colunas lidas pelo nome do cabeçalho (a ordem muda entre as abas)
const COLUNAS = {
  hub: ['hub'], modelo: ['modelodeoperacao', 'modelo'], dia: ['datadopagamento'], cliente: ['rest'],
  mensalidade: ['mensalidade'], mensalidade_total: ['mensalidadetotal'], erros_rs: ['errosoperacionais'],
  pedidos: ['totaldepedidos'], faturamento: ['faturamento'], variavel: ['variavel'], total_orion: ['totalorion'], obs: ['obs'],
};

function chave(s) {
  return String(s == null ? '' : s).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]/g, '');
}
function numero(v) {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v === 'number') return isFinite(v) ? Math.round(v * 100) / 100 : null;
  let s = String(v).replace(/R\$|\s/g, '');
  if (s.indexOf(',') >= 0) s = s.replace(/\./g, '').replace(',', '.');
  const n = Number(s);
  return isFinite(n) ? n : null;
}

function lerAbasFaturamento() {
  const planilha = SpreadsheetApp.openById(PLANILHA_FATURAMENTO);
  const porMes = {};
  planilha.getSheets().forEach(function (aba) {
    const nome = aba.getName();
    if (/andamento|atualizar/i.test(nome)) return;
    const m = nome.match(/cobran[çc]a\s*(\d{1,2})\s*\/?\s*(\d{4})/i);
    if (!m) return;
    const mes = m[2] + '-' + ('0' + m[1]).slice(-2);
    // se houver duas abas do mesmo mês, fica a que não é "Cópia de"
    if (porMes[mes] && /^\s*c[óo]pia/i.test(nome)) return;
    porMes[mes] = aba;
  });
  const meses = Object.keys(porMes).sort().slice(-MESES_FATURAMENTO);
  return meses.map(function (mes) {
    const aba = porMes[mes];
    const valores = aba.getDataRange().getValues();
    const cab = (valores[0] || []).map(chave);
    const col = {};
    Object.keys(COLUNAS).forEach(function (k) {
      col[k] = cab.findIndex(function (h) { return COLUNAS[k].indexOf(h) >= 0; });
    });
    const linhas = [];
    valores.slice(1).forEach(function (l) {
      const cliente = col.cliente >= 0 ? String(l[col.cliente] || '').trim() : '';
      if (!cliente) return;
      const v = function (k) { return col[k] >= 0 ? l[col[k]] : null; };
      const hubN = numero(v('hub'));
      linhas.push({
        cliente: cliente.slice(0, 120),
        hub: HUB_POR_NUMERO[hubN] || (hubN ? 'Hub ' + hubN : ''),
        modelo: String(v('modelo') || '').trim().slice(0, 20),
        dia: numero(v('dia')),
        mensalidade: numero(v('mensalidade')),
        mensalidade_total: numero(v('mensalidade_total')),
        erros_rs: numero(v('erros_rs')),
        pedidos: numero(v('pedidos')),
        faturamento: numero(v('faturamento')),
        variavel: numero(v('variavel')),
        total_orion: numero(v('total_orion')),
        obs: String(v('obs') || '').slice(0, 1500),
      });
    });
    return { mes: mes, aba: aba.getName().trim(), linhas: linhas.slice(0, 400) };
  });
}

function importarFaturamento(codigo) {
  if (!codigo) return ContentService.createTextOutput('sem código');
  const abas = lerAbasFaturamento();
  const resp = UrlFetchApp.fetch(SUPABASE_URL + '/rest/v1/rpc/importar_faturamento', {
    method: 'post',
    contentType: 'application/json',
    headers: { apikey: SUPABASE_CHAVE, Authorization: 'Bearer ' + SUPABASE_CHAVE },
    payload: JSON.stringify({ codigo: codigo, abas: abas, fim: true }),
    muteHttpExceptions: true,
  });
  return ContentService.createTextOutput(resp.getResponseCode() < 300 ? 'ok: ' + abas.length + ' abas' : 'erro: ' + resp.getContentText());
}

// Para testar no editor do Apps Script: selecione esta função e clique em Executar.
// Mostra no registro (Execução) quantas abas e clientes o script consegue ler, sem enviar nada.
function testarLeituraFaturamento() {
  lerAbasFaturamento().forEach(function (a) { Logger.log(a.mes + ' · ' + a.aba + ' · ' + a.linhas.length + ' clientes'); });
}
