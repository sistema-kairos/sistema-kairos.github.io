# Gestão Hubs

Sistema web estático (HTML + CSS + JavaScript, sem build) para substituir as planilhas de **Comercial** e **CS**, com dashboards e um painel de **status dos sistemas** (Hubs Savassi, Cidade Nova, Pampulha e Buritis, ChatPro e push de pedidos). Roda direto no **GitHub Pages**.

## Páginas

| Página | Arquivo | O que faz |
|---|---|---|
| Início | `index.html` | Resumo rápido de todas as áreas |
| CRM | `crm.html` | Kanban de negociações do Comercial (Sem contato → Negócio fechado). No fim do funil há uma coluna de perda por etapa: Perdido [Contato feito], Perdido [Identificação de interesse]... Cada resposta do formulário cria uma negociação. Importa e exporta planilha |
| Indicadores | `indicadores.html?area=mkt` / `comercial` / `cs` | Lançamento mensal dos indicadores de cada área, com metas, fórmulas (ex.: CPL = investimento ÷ leads) e valores preenchidos pelo sistema a partir dos cadastros |
| Comercial | `comercial.html` | Controle de entrada de clientes (cadastro, busca, filtro por hub, importar/exportar planilha) |
| CS | `cs.html` | Solicitações de saída e aviso prévio. Ao digitar a loja, completa cliente, hub, mensalidade, taxa, espaço e data de início a partir do Comercial. Calcula a **saída prevista** (solicitação + aviso prévio) e o **tempo de vida** (meses) |
| Dashboard Comercial | `dashboard-comercial.html` | Novos clientes, mensalidade adicionada, ticket médio, % ICP, upsells, atraso de entrada, base ativa, gráficos por mês, hub e modelo |
| Dashboard CS | `dashboard-cs.html` | Solicitações, mensalidade perdida, churn, tempo de vida, saídas nos próximos 30 dias, reuniões de A.P pendentes |
| Status dos Sistemas | `sistemas.html` | Aberto/fechado de cada hub, ChatPro e push de pedidos, com atualização automática, histórico e alerta sonoro/notificação |
| Leads do formulário | `leads.html` | Respostas do formulário público, com status de atendimento, resumo e link para divulgar |
| Formulário (público) | `formulario-midias-sociais.html` | Formulário estilo Typeform para captar interessados. Não pede login |
| Permissões | `permissoes.html` | Perfis de acesso (Administrador, Utilizador por área, Espectador). Só administradores |
| Configurações | `configuracoes.html` | Banco de dados, modo de verificação de cada serviço, backup |

## 1. Publicar no GitHub Pages

1. Crie um repositório no GitHub (ex.: `gestao-hubs`) e envie esta pasta:
   ```bash
   cd gestao-hubs
   git init && git add . && git commit -m "Primeira versão"
   git branch -M main
   git remote add origin https://github.com/SEU-USUARIO/gestao-hubs.git
   git push -u origin main
   ```
2. No repositório: **Settings → Pages → Build and deployment → Source: Deploy from a branch**, branch `main`, pasta `/ (root)`.
3. Em ~1 minuto o site estará em `https://SEU-USUARIO.github.io/gestao-hubs/`.

> O GitHub Pages só hospeda arquivos. **Ele não salva dados.** Por isso existe o passo 2.

## 2. Banco de dados compartilhado (Supabase, gratuito)

Sem banco configurado, o sistema funciona em **modo local**: cada navegador guarda os próprios dados, sem compartilhar. Para a equipe toda ver os mesmos dados:

1. Crie uma conta e um projeto em https://supabase.com.
2. Abra **SQL Editor**, cole o conteúdo de [`supabase-schema.sql`](supabase-schema.sql) e execute.
3. Em **Authentication → Providers**, deixe *Email* ativo. Em **Authentication → Sign In / Providers**, desative "Allow new users to sign up" para ninguém criar conta sozinho.
4. Em **Authentication → Users → Add user**, crie o login de cada pessoa da equipe (e-mail + senha).
5. Em **Project Settings → API** copie a *Project URL* e a chave *anon public* e coloque em `config.js`:
   ```js
   supabaseUrl: 'https://xxxx.supabase.co',
   supabaseAnonKey: 'eyJhbGciOi...',
   ```
6. Faça commit/push. A partir daí o site pede login e todos compartilham os dados.

A chave *anon* pode ficar no código público: os dados só podem ser lidos e gravados por usuários logados (regras de RLS do `schema.sql`). **Nunca** coloque a chave `service_role` no site.

## 3. Migrar as planilhas atuais

Em **Comercial** ou **CS**, clique em **Importar planilha**, copie as linhas da planilha (Excel/Google Sheets) **com o cabeçalho** e cole. As colunas são reconhecidas pelo nome (os mesmos nomes da planilha atual). Valores como `R$ 1.500,00`, `5%`, `01/03/2025` e `mar/2025` são convertidos automaticamente.

## 4. Monitoramento dos sistemas

Em **Configurações → Monitoramento**, cada serviço tem um modo:

| Modo | Quando usar |
|---|---|
| **Manual** | Padrão para os hubs e o ChatPro. A equipe clica em "Marcar aberto/fechado" e todos veem o status (com quem alterou e quando) |
| **HTTP** | Existe uma URL de status/healthcheck que responde 2xx e permite CORS |
| **Alcance** | Só verifica se um site responde (não lê o conteúdo) |
| **Campo JSON** | Existe uma API que retorna, por exemplo, `{"aberto": true}`: configure campo `aberto`, esperado `true` |
| **Heartbeat** | Padrão para o push de pedidos. O sistema que envia os pushes chama o endpoint abaixo a cada poucos minutos. Se ficar mais de X minutos sem chamar, aparece **Fora do ar** |

Endpoint do heartbeat (precisa do Supabase configurado):

```bash
curl -X POST 'https://xxxx.supabase.co/rest/v1/rpc/heartbeat' \
  -H 'apikey: SUA_ANON_KEY' \
  -H 'Content-Type: application/json' \
  -d '{"servico": "push_pedidos"}'
```

O ideal é chamar esse endpoint **logo depois de um push de pedido ser enviado com sucesso**. Assim o painel mostra que o fluxo inteiro funciona, não só que o servidor está ligado. Para aceitar novos IDs de serviço, edite a lista na função `heartbeat` do `schema.sql`.

A página de status atualiza sozinha (intervalo configurável). Com **Ativar alertas**, o navegador toca um som e mostra uma notificação quando algo cai, se a aba estiver aberta.

## Personalização

- **Campos dos cadastros:** `schemas.js` (nome, tipo, se aparece na tabela, opções de listas).
- **Hubs:** `config.js` (`hubs`).
- **Cores e layout:** `style.css` (claro/escuro automático).

## Testar localmente

```bash
cd gestao-hubs
python3 -m http.server 8000
# abra http://localhost:8000
```

## Formulário público de leads

O link para divulgar é `https://SEU-USUARIO.github.io/NOME-DO-REPOSITORIO/formulario-midias-sociais.html` (também aparece na aba **Leads do formulário**, com botão de copiar).
Quem preenche não precisa de login: as respostas são gravadas pela função `enviar_lead` do Supabase, que só aceita os campos do formulário.

- **Ativar:** rode novamente o [`supabase-schema.sql`](supabase-schema.sql) no SQL Editor do Supabase (o script pode ser executado mais de uma vez). Sem esse passo o formulário mostra "Não foi possível enviar".
- **Origem dos leads:** links com `?utm_source=instagram&utm_campaign=outubro` guardam a origem em cada resposta.

## Permissões e áreas

O sistema é dividido em 3 áreas: **Comercial** (CRM, Clientes, Dashboard Comercial, Indicadores), **CS** (Solicitações de saída, Dashboard CS, Indicadores) e **MKT** (Leads do formulário, Indicadores).

| Perfil | O que pode |
|---|---|
| Administrador | Ver e alterar tudo, inclusive Permissões e Configurações |
| Utilizador (por área) | Ver e alterar só a própria área. Comercial e CS consultam, sem alterar, os clientes um do outro (os dashboards cruzam esses dados) |
| Espectador | Só visualizar, de uma área ou de todas |

As regras valem no próprio banco (Supabase, RLS), não só nas telas.

1. Rode o [`supabase-schema.sql`](supabase-schema.sql) no SQL Editor do Supabase.
2. Abra **Sistema → Permissões** e clique em **Tornar-me administrador**. Enquanto não houver um administrador, todos os usuários logados têm acesso total.
3. Cadastre cada pessoa: crie o login no Supabase (Authentication → Users → Add user) e, em Permissões, informe o mesmo e-mail, o perfil e a área.

## Importar negociações no CRM

Em **CRM → Importar planilha**, cole as linhas da planilha (com o cabeçalho) ou escolha um CSV. Use **Baixar planilha modelo** para ver as colunas aceitas: Negociação, Etapa, Contato, Telefone, E-mail, Empresa, Hub, Fonte, Valor, Responsável, Criada em, Motivo da perda, entre outras.

- **Etapa:** o nome da etapa do funil ou, para perdidos, `Perdido [Nome da etapa]`. Também são aceitos `Perdido - Nome da etapa` e uma coluna separada **Perdido em**.
- **Etapas que o sistema não reconhece:** a negociação entra em "Sem contato" e o nome original fica nas anotações.
- **Duplicados:** contatos que já estão no CRM (mesmo telefone ou e-mail) são ignorados, se a opção estiver marcada.

## Indicadores das áreas

Cada área tem uma aba **Indicadores** no menu. No topo, escolha o mês e lance os valores. Abaixo, a tabela mostra o ano, com as metas.

- **Manual:** lançado pela equipe.
- **Automático** (bolinha azul): o sistema calcula a partir do CRM, dos Clientes, do CS ou dos Leads. Se alguém lançar um valor, ele substitui o calculado.
- **Fórmula:** calculado a partir de outros indicadores, pelo código. Ex.: `investimento / leads`. O total do ano usa só os meses em que todos os valores da conta existem.

Em **Gerenciar indicadores**, a equipe da área adiciona, remove ou reordena indicadores, e define metas e fórmulas. Os valores ficam nas tabelas `ind_mkt`, `ind_comercial` e `ind_cs`: cada área altera só os próprios indicadores. **Depois desta atualização, rode de novo o `supabase-schema.sql`** para o banco reconhecer essas tabelas. Até lá, só administradores conseguem salvar indicadores.

## Tarefas no CRM

Cada negociação tem a seção **Tarefas**, no topo do painel. Os botões criam uma tarefa de **Ligação, Cold call, Follow up, Visita, Reunião**, ou de outro tipo (WhatsApp, E-mail, Outro), com data, hora, responsável e anotações.

- Marque a caixinha para concluir. Se a negociação ficar sem tarefas pendentes, o sistema sugere agendar a próxima.
- O card no quadro mostra a próxima tarefa: em amarelo se for hoje, em vermelho se estiver atrasada.
- No topo do CRM aparecem os contadores de tarefas atrasadas e para hoje (clique para filtrar), e o filtro **Tarefas** separa as negociações com tarefa atrasada, para hoje ou sem tarefa agendada.

## Sprints

Aba aberta a toda a equipe (`sprints.html`): administradores e Utilizadores de qualquer área editam, e Espectadores só leem.

- **Uma linha por semana**, que abre e fecha. A semana atual abre sozinha.
- Dentro de cada semana há duas partes, que também abrem e fecham:
  - **📋 Sprint:** documento em branco com formatação (negrito, títulos, listas, checklist, separador e link) e, embaixo, o quadro **📊 Coleta de dados**;
  - **🔁 Retrospectiva:** documento em branco.
- Dá para colar o texto do ClickUp, do Word ou do Google Docs. A formatação é mantida, e qualquer código perigoso é removido.
- Os documentos salvam sozinhos. Se duas pessoas editarem o mesmo documento ao mesmo tempo, o sistema avisa e pergunta qual versão manter.
- **+ Adicionar sprint da semana seguinte** cria a semana depois da última sprint (ou a semana atual, se a equipe pulou semanas).
- **Coleta de dados:** preenchida pela plataforma a partir do CRM, na semana da sprint.
  - Leads PA e passivos, pela fonte da negociação.
  - Ligações, cold calls (realizadas e atendidas), porta a porta e visitas/reuniões, pelas tarefas concluídas.
  - Contratos e valor fechado por hub.
  - Q1/Q3/Q5 de MQL e de SQL.

  Qualquer número pode ser corrigido à mão.

A aba **Status dos Sistemas** é exclusiva dos administradores.

## Mudanças no banco (migrações)

Cada mudança no banco fica num arquivo em [`supabase/migrations/`](supabase/migrations), aplicado pelo script `scripts/aplicar-sql.sh`. O script usa a API oficial do Supabase, com um token restrito ao banco e guardado no Keychain do Mac (nunca no repositório). O banco registra o que já foi aplicado na tabela `privado.migracoes`, para nada rodar duas vezes. O [`supabase-schema.sql`](supabase-schema.sql) continua sendo o retrato completo do banco, para criar um projeto do zero.
