"use strict";
/*
  "use strict": Ativa o modo estrito do JavaScript.
  No modo estrito:
  - Variáveis precisam ser declaradas antes de usar (evita bugs silenciosos)
  - Certas sintaxes inseguras são proibidas
  - Erros que antes eram silenciosos passam a gerar exceções
  SEMPRE recomendado em projetos modernos.
*/

/* =====================================================================
   ESTADO GLOBAL
   Variáveis acessíveis por TODAS as funções do arquivo.
   "Estado" = dados que representam a situação atual do sistema.
====================================================================== */

let usuarioAtual = "";
/*
  Armazena o nome do usuário que está logado no momento.
  Começa como string vazia pois ninguém está logado ao iniciar.
  Usada para prefixar as chaves no localStorage (ex: "disciplinas_João"),
  separando os dados de cada usuário.
*/

let grafico = null;
const STORAGE_KEYS = {
  darkMode: "sistema_notas_dark_mode"
};

let deferredInstallPrompt = null;
/*
  Guarda a instância atual do gráfico Chart.js.
  Começa como null (nenhum gráfico criado ainda).
  É necessário guardar a referência para poder destruir (grafico.destroy())
  o gráfico antigo antes de criar um novo, evitando sobreposição.
*/

/* =====================================================================
   SISTEMA DE MENÇÃO
   Converte uma nota numérica em uma menção (conceito) qualitativo.
   Critérios:
     ≤ 4.0       → I  (Insuficiente)
     > 4.0 e ≤ 6 → R  (Regular)
     > 6.0 e ≤ 8 → B  (Bom)
     > 8.0 e ≤ 10 → MB (Muito Bom)
====================================================================== */

function getMencao(nota) {
  /*
    Função pura: recebe um número e retorna uma string.
    Usa estrutura if/else encadeada (cascata de condições).
    A ordem importa: se chegou no if (nota <= 6), já sabemos que nota > 4
    porque a condição anterior foi verificada primeiro.
  */
  if (nota <= 4)  return "I";   // Insuficiente
  if (nota <= 6)  return "R";   // Regular
  if (nota <= 8)  return "B";   // Bom
  return "MB";                  // Chegou aqui → nota > 8, então é Muito Bom
}

function getCorMencao(mencao) {
  /*
    Recebe uma string de menção ("MB", "B", "R" ou "I")
    e retorna o código de cor hexadecimal correspondente.

    Técnica: objeto como "mapa/dicionário" (lookup table).
    Muito mais limpo que vários if/else para mapear valores.
    cores[mencao] busca a propriedade com o nome igual à menção.
    O || "#6b7280" é o valor padrão caso a menção não exista no mapa.
  */
  const cores = {
    MB: "#16a34a",  // Verde — Muito Bom
    B:  "#2563eb",  // Azul  — Bom
    R:  "#d97706",  // Laranja — Regular
    I:  "#e53e3e"   // Vermelho — Insuficiente
  };
  return cores[mencao] || "#6b7280"; // Cinza como fallback
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#39;"
  })[char]);
}

function estaEmModoApp() {
  return window.matchMedia("(display-mode: standalone)").matches || window.navigator.standalone === true;
}

function atualizarBotaoTema() {
  const btnDark = document.getElementById("btnDark");
  if (!btnDark) return;

  const estaEscuro = document.body.classList.contains("dark");
  btnDark.textContent = estaEscuro ? "☀️" : "🌙";
  btnDark.title = estaEscuro ? "Modo claro" : "Modo escuro";
}

function aplicarTemaSalvo() {
  const salvo = localStorage.getItem(STORAGE_KEYS.darkMode);
  const prefereEscuro = salvo !== null
    ? salvo === "true"
    : window.matchMedia("(prefers-color-scheme: dark)").matches;

  document.body.classList.toggle("dark", prefereEscuro);
  atualizarBotaoTema();
}

function atualizarBotaoInstalacao() {
  const btnInstalar = document.getElementById("btnInstalar");
  if (!btnInstalar) return;

  const label = btnInstalar.querySelector(".btn-label");

  if (estaEmModoApp()) {
    btnInstalar.hidden = true;
    return;
  }

  if (window.location.protocol === "file:") {
    btnInstalar.hidden = false;
    btnInstalar.disabled = true;
    btnInstalar.title = "Abra em localhost ou HTTPS para instalar";
    if (label) label.textContent = "Localhost";
    return;
  }

  btnInstalar.hidden = !deferredInstallPrompt;
  btnInstalar.disabled = !deferredInstallPrompt;
  btnInstalar.title = deferredInstallPrompt
    ? "Instalar app"
    : "Aguardando disponibilidade do navegador";

  if (label) label.textContent = "Instalar";
}

async function instalarApp() {
  if (estaEmModoApp()) return;

  if (window.location.protocol === "file:") {
    mostrarToast("Abra o projeto em localhost ou HTTPS para instalar o app.", "info");
    return;
  }

  if (!deferredInstallPrompt) {
    mostrarToast("O navegador ainda não liberou a instalação nesta página.", "info");
    return;
  }

  deferredInstallPrompt.prompt();
  const { outcome } = await deferredInstallPrompt.userChoice;
  deferredInstallPrompt = null;
  atualizarBotaoInstalacao();

  if (outcome === "accepted") {
    mostrarToast("Instalação iniciada pelo navegador.", "sucesso");
  }
}

/* =====================================================================
   GERENCIAMENTO DE USUÁRIOS
   Funções para ler, salvar e listar usuários no localStorage.
   localStorage é um banco de dados simples do navegador
   que persiste os dados mesmo após fechar a aba.
====================================================================== */

function getUsuarios() {
  /*
    Lê a lista de usuários do localStorage.
    localStorage.getItem retorna uma string JSON ou null (se não existir).
    
    Fluxo:
    1. Tenta buscar o item "usuarios" salvo
    2. Se existir → converte de JSON para array com JSON.parse
    3. Se não existir (null) → cria o array padrão com 3 usuários de exemplo
       e já salva no localStorage para uso futuro
  */
  const salvo = localStorage.getItem("usuarios");
  if (salvo) return JSON.parse(salvo);

  // Primeira vez que o sistema é aberto: cria usuários padrão
  const padrao = ["Maércio", "João", "Maria"];
  localStorage.setItem("usuarios", JSON.stringify(padrao));
  return padrao;
}

function salvarUsuarios(lista) {
  /*
    Salva o array de usuários no localStorage.
    localStorage só armazena strings, então usamos JSON.stringify
    para converter o array JavaScript em uma string JSON.
    Exemplo: ["João", "Maria"] → '["João","Maria"]'
  */
  localStorage.setItem("usuarios", JSON.stringify(lista));
}

function carregarUsuarios() {
  /*
    Popula o <select id="listaUsuarios"> com os usuários existentes.
    É chamada ao inicializar a página (última linha do arquivo).
    
    Fluxo:
    1. Busca o elemento select no HTML
    2. Limpa qualquer opção existente (innerHTML = "")
    3. Para cada usuário, cria uma <option> dinamicamente
       e a adiciona ao select
  */
  const select = document.getElementById("listaUsuarios");
  if (!select) return; // Proteção: sai se o elemento não existir na página
  select.innerHTML = ""; // Limpa opções anteriores

  getUsuarios().forEach(u => {
    // forEach itera sobre cada item do array
    const opt = document.createElement("option"); // Cria elemento <option>
    opt.value = u;       // Valor enviado pelo formulário
    opt.textContent = u; // Texto visível para o usuário
    select.appendChild(opt); // Adiciona a opção ao select
  });
}

function cadastrarUsuario() {
  /*
    Lê o campo de novo usuário, valida e adiciona à lista.
    
    Validações:
    1. Nome não pode ser vazio
    2. Não pode existir usuário com o mesmo nome (case-insensitive)
  */
  const input = document.getElementById("novoUsuario");
  const nome  = input.value.trim();
  // .trim() remove espaços no início e fim da string
  // evita que " " (espaço) seja aceito como nome válido

  if (!nome) {
    // String vazia é falsy em JavaScript, então !nome é true
    mostrarToast("Digite um nome para o usuário.", "erro");
    input.focus(); // Foca o campo para facilitar a correção
    return;        // Interrompe a execução da função
  }

  const lista = getUsuarios();

  // .some() retorna true se ALGUM elemento satisfaz a condição
  // .toLowerCase() para comparação sem distinção de maiúsculas
  if (lista.some(u => u.toLowerCase() === nome.toLowerCase())) {
    mostrarToast("Usuário já existe!", "erro");
    input.focus();
    return;
  }

  lista.push(nome);        // Adiciona ao final do array
  salvarUsuarios(lista);   // Persiste no localStorage
  carregarUsuarios();      // Atualiza o select com o novo usuário

  // Seleciona automaticamente o usuário recém-criado no dropdown
  document.getElementById("listaUsuarios").value = nome;

  input.value = ""; // Limpa o campo após cadastro
  mostrarToast(`Usuário "${nome}" criado!`, "sucesso");
}

/* =====================================================================
   LOGIN / LOGOUT
   Controla a transição entre a tela de login e o sistema principal.
====================================================================== */

function login() {
  /*
    Realiza o login do usuário selecionado.
    
    Fluxo:
    1. Lê o usuário selecionado no dropdown
    2. Armazena na variável global usuarioAtual
    3. Esconde a tela de login e exibe o sistema
    4. Inicializa os componentes do sistema (select, lista, gráfico)
  */
  const sel  = document.getElementById("listaUsuarios");
  const nome = sel ? sel.value : ""; // Operador ternário: se sel existe, pega o valor

  if (!nome) {
    mostrarToast("Selecione um usuário.", "erro");
    return;
  }

  usuarioAtual = nome; // Guarda o usuário logado na variável global

  // Manipulação do DOM: alterna visibilidade entre as telas
  document.getElementById("loginBox").style.display = "none";  // Esconde login
  document.getElementById("sistema").style.display  = "block"; // Exibe sistema

  // Exibe o nome do usuário na barra superior
  document.getElementById("nomeUsuario").textContent = "👤 " + usuarioAtual;

  // Inicializa os componentes com os dados do usuário logado
  atualizarSelect(); // Preenche o dropdown de disciplinas
  listar();          // Renderiza a lista de resultados
  gerarGrafico();    // Desenha o gráfico de desempenho
  atualizarBotaoInstalacao();
}

function confirmarLogout() {
  /*
    Exibe um modal de confirmação antes de fazer logout.
    Usar confirmação evita logout acidental.
    Se confirmado, recarrega a página (location.reload),
    que volta para a tela de login e limpa o estado em memória.
  */
  abrirModal({
    msg: "Deseja realmente sair?",
    onConfirm: () => location.reload()
    // Arrow function (=>) passada como callback — executada apenas se confirmar
  });
}

/* =====================================================================
   GERENCIAMENTO DE DISCIPLINAS
   Cada usuário tem sua própria lista de disciplinas no localStorage.
   A chave inclui o nome do usuário: "disciplinas_NomeDoUsuario"
   Isso garante isolamento completo entre os dados de cada usuário.
====================================================================== */

function getDisciplinas() {
  /*
    Retorna o array de disciplinas do usuário logado.
    Cada disciplina é um objeto: { nome: "Matemática", notas: [7, 8, 9] }
    Se não existir nada salvo, retorna array vazio [].
  */
  const raw = localStorage.getItem("disciplinas_" + usuarioAtual);
  return raw ? JSON.parse(raw) : [];
}

function salvarDisciplinas(lista) {
  /*
    Persiste o array de disciplinas no localStorage.
    Usa a mesma chave composta "disciplinas_" + nome do usuário.
  */
  localStorage.setItem("disciplinas_" + usuarioAtual, JSON.stringify(lista));
}

function cadastrarDisciplina() {
  /*
    Cria uma nova disciplina para o usuário logado.
    
    Estrutura de uma disciplina:
    { nome: "Matemática", notas: [] }  ← começa sem notas
    
    Validações:
    1. Nome não pode ser vazio
    2. Não pode existir disciplina com o mesmo nome (case-insensitive)
  */
  const input = document.getElementById("nomeDisciplina");
  const nome  = input.value.trim();

  if (!nome) {
    mostrarToast("Digite o nome da disciplina.", "erro");
    input.focus();
    return;
  }

  const lista = getDisciplinas();
  if (lista.some(d => d.nome.toLowerCase() === nome.toLowerCase())) {
    mostrarToast("Disciplina já cadastrada!", "erro");
    input.focus();
    return;
  }

  lista.push({ nome, notas: [] });
  // Shorthand ES6: { nome } equivale a { nome: nome }
  // notas começa como array vazio pois ainda não foram lançadas

  salvarDisciplinas(lista);
  input.value = "";

  // Atualiza todos os componentes visuais
  atualizarSelect(); // Select do card "Lançar Notas"
  listar();          // Lista de resultados
  gerarGrafico();    // Gráfico de barras
  mostrarToast("Disciplina cadastrada!", "sucesso");
}

function editarDisciplina(index) {
  /*
    Abre um modal com campo de texto para renomear a disciplina.
    Parâmetro: index = posição da disciplina no array.
    
    O modal recebe um objeto de configuração com:
    - msg: texto do modal
    - input: true → exibe campo de texto no modal
    - inputValor: pré-preenche com o nome atual
    - onConfirm: função executada ao confirmar (com o novo nome digitado)
  */
  const lista = getDisciplinas();
  abrirModal({
    msg: "Novo nome para a disciplina:",
    input: true,
    inputValor: lista[index].nome,
    onConfirm: (novoNome) => {
      novoNome = (novoNome || "").trim();
      // (novoNome || "") protege contra null/undefined

      if (!novoNome) {
        mostrarToast("O nome não pode estar vazio.", "erro");
        return;
      }

      // Verifica duplicata ignorando o próprio item (i !== index)
      if (lista.some((d, i) => i !== index && d.nome.toLowerCase() === novoNome.toLowerCase())) {
        mostrarToast("Já existe uma disciplina com esse nome!", "erro");
        return;
      }

      lista[index].nome = novoNome; // Atualiza o nome no array
      salvarDisciplinas(lista);
      atualizarSelect();
      listar();
      gerarGrafico();
      mostrarToast("Disciplina renomeada!", "sucesso");
    }
  });
}

function excluirDisciplina(index) {
  /*
    Remove permanentemente uma disciplina (e suas notas) após confirmação.
    Parâmetro: index = posição da disciplina no array.
  */
  const lista = getDisciplinas();
  abrirModal({
    msg: `Excluir "${lista[index].nome}"? Esta ação não pode ser desfeita.`,
    // Template literal (crase) permite inserir variáveis com ${...}
    onConfirm: () => {
      lista.splice(index, 1);
      // splice(início, quantidade): remove 1 elemento na posição index
      // Modifica o array original (mutação direta)

      salvarDisciplinas(lista);
      atualizarSelect();
      listar();
      gerarGrafico();
      mostrarToast("Disciplina excluída.", "info");
    }
  });
}

/* =====================================================================
   GERENCIAMENTO DE NOTAS
   Funções para carregar notas salvas nos campos e salvar novas notas.
====================================================================== */

function carregarNotasDisciplina() {
  /*
    Preenche os campos de nota (.nota) com os valores já salvos
    da disciplina selecionada no dropdown.
    
    Chamada automaticamente via onchange no select (HTML).
    Permite ao usuário ver e editar as notas já lançadas.
  */
  const lista  = getDisciplinas();
  const index  = parseInt(document.getElementById("disciplinaSelect").value);
  // parseInt converte o value do select (string) para número inteiro
  // Necessário pois o value de inputs é sempre string em JavaScript

  const inputs = document.querySelectorAll(".nota");
  // querySelectorAll retorna uma NodeList com TODOS os elementos com classe .nota

  inputs.forEach((inp, i) => {
    // i = índice (0 a 4) de cada campo de nota
    inp.value = (!isNaN(index) && lista[index] && lista[index].notas[i] !== undefined)
      ? lista[index].notas[i]  // Preenche com a nota salva
      : "";                    // Ou esvazia o campo
    /*
      Condição composta:
      - !isNaN(index)                   → o índice é um número válido
      - lista[index]                    → a disciplina existe
      - lista[index].notas[i] !== undefined → a nota nessa posição existe
      Só preenche se TODAS as condições forem verdadeiras.
    */
  });
}

function salvarNotas() {
  /*
    Lê os campos de nota, valida e salva no array da disciplina.
    
    Fluxo:
    1. Obtém a disciplina selecionada
    2. Para cada campo preenchido, converte para número e valida
    3. Salva o array de notas na disciplina
    4. Atualiza a interface
  */
  const lista  = getDisciplinas();
  const index  = parseInt(document.getElementById("disciplinaSelect").value);

  if (isNaN(index) || !lista[index]) {
    mostrarToast("Selecione uma disciplina!", "erro");
    return;
  }

  const inputs = document.querySelectorAll(".nota");
  const notas  = []; // Array que vai acumular as notas válidas

  for (const inp of inputs) {
    // for...of: itera sobre coleções (mais moderno que for com índice)

    if (inp.value === "") continue;
    // continue: pula para a próxima iteração (campos vazios são ignorados)

    const val = parseFloat(inp.value.replace(",", "."));
    /*
      parseFloat: converte string para número decimal
      .replace(",", "."): aceita tanto "7,5" quanto "7.5"
      pois no Brasil usamos vírgula como separador decimal
    */

    if (isNaN(val) || val < 0 || val > 10) {
      // isNaN: verifica se não é um número válido
      mostrarToast(`Nota inválida: "${inp.value}". Use valores entre 0 e 10.`, "erro");
      inp.focus();
      return; // Para tudo se encontrar nota inválida
    }

    notas.push(val); // Adiciona a nota válida ao array
  }

  lista[index].notas = notas; // Substitui o array de notas da disciplina
  salvarDisciplinas(lista);
  listar();
  gerarGrafico();
  mostrarToast("Notas salvas!", "sucesso");
}

/* =====================================================================
   CÁLCULO DE MÉDIA
   Função pura: recebe um array de notas e retorna a média aritmética.
====================================================================== */

function calcularMedia(notas) {
  /*
    Calcula a média aritmética simples de um array de números.
    
    Retorna null se o array for vazio ou inválido (sem notas lançadas).
    toFixed(1) arredonda para 1 casa decimal (ex: 7.666... → 7.7).
    parseFloat remove zeros desnecessários (ex: "7.00" → 7, não "7.0").
  */
  if (!notas || !notas.length) return null;
  // !notas.length é equivalente a notas.length === 0

  const soma = notas.reduce((a, b) => a + b, 0);
  /*
    reduce: percorre o array acumulando um valor.
    (a, b) => a + b → soma o acumulador (a) com o elemento atual (b)
    0 → valor inicial do acumulador
    Resultado: a soma de todos os elementos do array.
  */

  return parseFloat((soma / notas.length).toFixed(1));
}

/* =====================================================================
   LISTAGEM DE RESULTADOS
   Renderiza dinamicamente a lista de disciplinas com notas, médias e menções.
====================================================================== */

function listar() {
  /*
    Constrói o HTML de cada disciplina e o insere na div#listaDisciplinas.
    É chamada sempre que os dados mudam (cadastro, edição, exclusão, notas).
    
    Padrão: limpa o container e reconstrói do zero a cada atualização.
    Para listas pequenas, é mais simples que atualização granular.
  */
  const lista = getDisciplinas();
  const div   = document.getElementById("listaDisciplinas");
  const empty = document.getElementById("semDisciplinas");
  div.innerHTML = ""; // Limpa o conteúdo anterior completamente

  if (!lista.length) {
    empty.style.display = "block"; // Exibe mensagem de lista vazia
    return;
  }

  empty.style.display = "none"; // Esconde mensagem quando há dados

  lista.forEach((d, i) => {
    // d = objeto disciplina, i = índice no array

    const media       = calcularMedia(d.notas);
    const mencao      = media !== null ? getMencao(media) : null;
    // Operador ternário: se media existe, calcula menção; caso contrário null

    const detalhe     = d.notas && d.notas.length ? d.notas.join(" · ") : "sem notas";
    // join(" · "): une os números do array em string: [7, 8, 9] → "7 · 8 · 9"

    const badgeClass  = mencao || "NA"; // "NA" quando não há notas (sem menção)
    const badgeLabel  = mencao || "S/N"; // "S/N" = Sem Nota
    const mediaLabel  = media !== null ? media : "—"; // "—" quando não há média

    const row = document.createElement("div");
    row.className = "resultado";

    row.innerHTML = `
      <div class="resultado-info">
        <strong>${escapeHtml(d.nome)}</strong>
        <span class="notas-detalhe">${escapeHtml(detalhe)}</span>
      </div>
      <div class="resultado-direita">
        <div class="media-box">
          <span class="media-valor">${mediaLabel}</span>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <button class="btn-icon btn-edit" title="Editar disciplina" onclick="editarDisciplina(${i})">✏️</button>
        <button class="btn-icon btn-del"  title="Excluir disciplina" onclick="excluirDisciplina(${i})">🗑️</button>
      </div>`;
    /*
      Template literal com HTML dinâmico.
      ${...} insere valores JavaScript dentro da string.
      Os botões passam o índice i para saber qual disciplina editar/excluir.
      A classe do badge (I, R, B, MB, NA) é usada pelo CSS para aplicar
      a cor correspondente.
    */

    div.appendChild(row); // Adiciona o elemento ao container
  });
}

/* =====================================================================
   ATUALIZAÇÃO DO SELECT DE DISCIPLINAS
   Sincroniza o dropdown "Lançar Notas" com a lista atual de disciplinas.
====================================================================== */

function atualizarSelect() {
  /*
    Reconstrói as opções do select de disciplinas.
    O value de cada option é o ÍNDICE no array (não o nome),
    pois o índice é usado para acessar e modificar a disciplina correta.
    
    Após atualizar, chama carregarNotasDisciplina() para preencher
    os campos com as notas da disciplina agora selecionada.
  */
  const lista  = getDisciplinas();
  const select = document.getElementById("disciplinaSelect");
  select.innerHTML = ""; // Limpa opções antigas

  lista.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = i;          // Índice como valor
    opt.textContent = d.nome; // Nome da disciplina como texto visível
    select.appendChild(opt);
  });

  carregarNotasDisciplina(); // Atualiza os campos de nota
}

/* =====================================================================
   GRÁFICO DE DESEMPENHO
   Cria/atualiza o gráfico de barras usando a biblioteca Chart.js.
====================================================================== */

function gerarGrafico() {
  /*
    Gera um gráfico de barras mostrando a média de cada disciplina.
    Cada barra é colorida de acordo com a menção (verde, azul, laranja, vermelho).
    
    Se já existe um gráfico, ele é destruído antes de criar o novo.
    Isso evita sobreposição de múltiplos gráficos no mesmo canvas.
  */
  const lista = getDisciplinas();
  const ctx   = document.getElementById("graficoDisciplinas");
  // ctx = referência ao elemento <canvas> — Chart.js usa para desenhar

  // Arrays de dados para o gráfico
  const labels = lista.map(d => d.nome);
  // .map(): cria novo array transformando cada elemento
  // Resultado: array com os nomes das disciplinas ["Matemática", "Português", ...]

  const dados = lista.map(d => calcularMedia(d.notas) ?? 0);
  // ?? 0: operador nullish coalescing — usa 0 se calcularMedia retornar null
  // Garante que o gráfico não quebre com disciplinas sem notas

  const cores = dados.map(v => getCorMencao(getMencao(v)));
  // Para cada média, obtém a menção e então a cor correspondente
  // Resultado: array de cores hexadecimais para cada barra

  if (grafico) grafico.destroy();
  // Destrói o gráfico anterior (se existir) para evitar duplicação

  grafico = new Chart(ctx, {
    /*
      Criação do gráfico Chart.js com objeto de configuração.
      
      type: "bar" → gráfico de barras verticais
      data → dados do gráfico (labels e datasets)
      options → configurações visuais e de comportamento
    */
    type: "bar",
    data: {
      labels, // Nomes das disciplinas (eixo X)
      datasets: [{
        label: "Média",
        data: dados,                    // Alturas das barras (eixo Y)
        backgroundColor: cores,         // Cor de preenchimento de cada barra
        borderRadius: 6,               // Bordas arredondadas nas barras
        borderSkipped: false           // Arredonda também a base da barra
      }]
    },
    options: {
      responsive: true,          // Redimensiona com o container
      maintainAspectRatio: false, // Usa a altura definida no CSS (não proporcional)
      plugins: {
        legend: { display: false }, // Remove a legenda (desnecessária com 1 dataset)
        tooltip: {
          callbacks: {
            label: c => {
              // Personaliza o texto do tooltip (ao passar o mouse sobre a barra)
              const media  = c.parsed.y; // Valor da barra (c.parsed.y = eixo Y)
              const mencao = getMencao(media);
              return ` Média: ${media}  |  Menção: ${mencao}`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0, max: 10,        // Escala do eixo Y de 0 a 10
          ticks: { stepSize: 2 }, // Marcações a cada 2 unidades (0, 2, 4, 6, 8, 10)
          grid: { color: "rgba(0,0,0,0.05)" } // Linhas de grade sutis
        },
        x: { grid: { display: false } } // Remove grade vertical (mais limpo)
      }
    }
  });
}

/* =====================================================================
   EXPORTAÇÃO EM PDF
   Gera um arquivo PDF com o boletim do usuário usando a biblioteca jsPDF.
====================================================================== */

function exportarPDF() {
  /*
    Cria um PDF formatado com o boletim escolar do usuário logado.
    O arquivo é gerado no navegador (client-side) e baixado automaticamente.
    Não há servidor envolvido — tudo acontece no JavaScript do navegador.
  */
  const { jsPDF } = window.jspdf;
  // Desestruturação: extrai a classe jsPDF do objeto window.jspdf
  // window.jspdf é criado quando o script da biblioteca é carregado

  const doc   = new jsPDF();   // Cria novo documento PDF (A4 por padrão)
  const lista = getDisciplinas();

  // ---- CABEÇALHO DO DOCUMENTO ----
  doc.setFont("helvetica", "bold");    // Fonte: Helvetica em negrito
  doc.setFontSize(16);                  // Tamanho 16pt
  doc.text("Boletim Escolar — " + usuarioAtual, 14, 18);
  // text(string, x, y): posiciona texto nas coordenadas em mm
  // x=14mm da esquerda, y=18mm do topo

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);               // Cinza (valor de 0=preto a 255=branco)
  doc.text("Gerado em: " + new Date().toLocaleDateString("pt-BR"), 14, 26);
  // new Date() cria objeto de data atual
  // toLocaleDateString("pt-BR") formata como "14/04/2025"

  // ---- CABEÇALHO DA TABELA ----
  doc.setTextColor(0);                 // Preto
  doc.setFontSize(11);
  doc.setFont("helvetica", "bold");
  doc.text("Disciplina", 14, 38);
  doc.text("Notas",      80, 38);
  doc.text("Média",     130, 38);
  doc.text("Menção",    160, 38);
  doc.setFont("helvetica", "normal");
  doc.line(14, 40, 196, 40); // Linha horizontal: de (14,40) até (196,40)

  // ---- LINHAS DA TABELA ----
  let y = 48; // Posição Y inicial das linhas de dados
  lista.forEach(d => {
    const media    = calcularMedia(d.notas);
    const mencao   = media !== null ? getMencao(media) : "S/N";
    const notasStr = d.notas && d.notas.length ? d.notas.join(", ") : "—";
    const mediaStr = media !== null ? String(media) : "—";
    // String(media): converte número para string para o jsPDF exibir

    doc.text(d.nome,   14,  y);
    doc.text(notasStr, 80,  y);
    doc.text(mediaStr, 130, y);
    doc.text(mencao,   160, y);
    y += 10; // Avança 10mm para a próxima linha

    if (y > 270) {
      // Se chegou perto do final da página (A4 tem ~297mm de altura)
      doc.addPage(); // Adiciona nova página
      y = 20;        // Reinicia a posição Y no topo da nova página
    }
  });

  doc.save("boletim_" + usuarioAtual + ".pdf");
  // Gera o arquivo e aciona o download no navegador
  mostrarToast("PDF gerado!", "sucesso");
}

/* =====================================================================
   MODO ESCURO (DARK MODE)
   Alterna entre tema claro e escuro usando uma classe CSS no <body>.
====================================================================== */

function toggleDarkMode() {
  /*
    Adiciona/remove a classe "dark" no elemento <body>.
    O CSS usa body.dark para redefinir as variáveis de cor (--bg, --card, etc.),
    mudando todo o visual da página sem JavaScript adicional.
    
    classList.toggle: se a classe existe, remove; se não existe, adiciona.
    classList.contains: verifica se a classe está presente.
  */
  document.body.classList.toggle("dark");
  localStorage.setItem(STORAGE_KEYS.darkMode, String(document.body.classList.contains("dark")));
  atualizarBotaoTema();
}

/* =====================================================================
   MODAL DINÂMICO
   Sistema de diálogo personalizado criado dinamicamente no DOM.
   Substitui o alert/confirm nativo do navegador, que é feio e bloqueante.
====================================================================== */

function abrirModal({ msg, input = false, inputValor = "", onConfirm }) {
  /*
    Cria e exibe um modal (janela de diálogo) personalizado.
    
    Parâmetros (desestruturação de objeto):
    - msg: texto/pergunta exibido no modal
    - input: se true, exibe campo de texto (para renomear disciplinas)
    - inputValor: valor inicial do campo de texto
    - onConfirm: função callback executada ao confirmar
    
    O modal é criado programaticamente no DOM (não existe no HTML).
    É removido ao fechar, liberando memória.
  */

  // Remove modal anterior se existir (evita duplicação)
  const anterior = document.getElementById("modalDinamico");
  if (anterior) anterior.remove();

  // Cria o overlay (fundo escurecido)
  const overlay = document.createElement("div");
  overlay.id        = "modalDinamico";
  overlay.className = "modal-overlay";

  // Monta o HTML interno do modal com template literal
  overlay.innerHTML = `
    <div class="modal-box animate">
      <p>${escapeHtml(msg)}</p>
      ${input ? `<input id="modalInput" type="text" value="${escapeHtml(inputValor)}" placeholder="Digite aqui...">` : ""}
      <!-- Expressão ternária: adiciona o campo de texto apenas se input=true -->
      <div class="modal-acoes">
        <button id="modalBtnConfirmar" class="btn-danger">Confirmar</button>
        <button id="modalBtnCancelar"  class="btn-secondary">Cancelar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay); // Adiciona o modal à página

  if (input) {
    const inp = document.getElementById("modalInput");
    inp.focus();  // Foca automaticamente o campo de texto
    inp.select(); // Seleciona todo o texto pré-preenchido (para facilitar edição)

    // Permite confirmar pressionando Enter (atalho de teclado)
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("modalBtnConfirmar").click();
    });
  }

  // Evento do botão Confirmar
  document.getElementById("modalBtnConfirmar").addEventListener("click", () => {
    const valor = input ? document.getElementById("modalInput").value : null;
    // Lê o valor do campo de texto (ou null se não há campo)
    fecharModal();    // Fecha o modal ANTES de executar o callback
    onConfirm(valor); // Executa a função passada como parâmetro
  });

  // Evento do botão Cancelar
  document.getElementById("modalBtnCancelar").addEventListener("click", fecharModal);

  // Fecha o modal ao clicar fora da caixa (no overlay escuro)
  overlay.addEventListener("click", e => {
    if (e.target === overlay) fecharModal();
    // e.target: elemento que recebeu o clique
    // Verifica se o clique foi no overlay (e não na modal-box interna)
  });
}

function fecharModal() {
  /*
    Remove o modal do DOM completamente.
    remove() é mais eficiente que display:none pois libera a memória
    dos event listeners e elementos criados dinamicamente.
  */
  const m = document.getElementById("modalDinamico");
  if (m) m.remove();
}

/* =====================================================================
   SISTEMA DE TOAST (NOTIFICAÇÕES)
   Exibe mensagens temporárias no canto da tela para feedback ao usuário.
   Desaparecem automaticamente após ~3 segundos.
====================================================================== */

function mostrarToast(msg, tipo = "info") {
  /*
    Cria e exibe uma notificação temporária (toast notification).
    
    Parâmetros:
    - msg: texto da mensagem
    - tipo: "sucesso" (verde), "erro" (vermelho) ou "info" (azul)
             tipo="info" é o valor padrão (parâmetro default)
    
    Técnica de animação:
    1. Cria o elemento com opacidade 0 (invisível)
    2. Após 50ms, adiciona classe "show" → CSS faz a transição para opacidade 1
    3. Após 2800ms, remove "show" → CSS faz transição de saída
    4. Após mais 300ms (fim da transição), remove o elemento do DOM
  */
  const toast = document.createElement("div");
  toast.className = "toast " + tipo; // Classe base + tipo para colorização
  toast.textContent = msg;
  document.body.appendChild(toast);

  // setTimeout: executa a função após o tempo em milissegundos
  setTimeout(() => toast.classList.add("show"), 50);
  // Pequeno delay (50ms) necessário para o navegador aplicar o estado inicial
  // antes de iniciar a transição CSS

  setTimeout(() => {
    toast.classList.remove("show");          // Inicia transição de saída
    setTimeout(() => toast.remove(), 300);   // Remove após a transição completar
  }, 2800); // Visível por 2800ms (~3 segundos)
}

/* =====================================================================
   REGISTRO DO SERVICE WORKER (PWA)
   O Service Worker é um script que roda em segundo plano no navegador,
   permitindo funcionalidades como cache offline e notificações push.
   É o componente central de um PWA (Progressive Web App).
====================================================================== */

if ("serviceWorker" in navigator && window.location.protocol !== "file:") {
  /*
    Verifica se o navegador suporta Service Workers antes de registrar.
    Navegadores antigos ou modo privado podem não suportar.
  */

  window.addEventListener("load", () => {
    // Registra o SW apenas após a página carregar completamente
    // evita competir por recursos durante o carregamento inicial

    navigator.serviceWorker.register("./service-worker.js", { scope: "./" })
      .then(() => console.log("Service Worker registrado com sucesso."))
      // .then(): Promise resolvida (registro bem-sucedido)
      // console.log: mensagem visível no DevTools > Console

      .catch(err => console.warn("Erro ao registrar o Service Worker:", err));
      // .catch(): Promise rejeitada (erro no registro)
      // console.warn: aviso amarelo no console (não é erro crítico)
  });
}

window.addEventListener("beforeinstallprompt", e => {
  e.preventDefault();
  deferredInstallPrompt = e;
  atualizarBotaoInstalacao();
});

window.addEventListener("appinstalled", () => {
  deferredInstallPrompt = null;
  atualizarBotaoInstalacao();
  mostrarToast("App instalado com sucesso!", "sucesso");
});

/* =====================================================================
   INICIALIZAÇÃO DA APLICAÇÃO
   Última linha executada: carrega os usuários ao abrir a página,
   populando o dropdown da tela de login.
====================================================================== */
aplicarTemaSalvo();
carregarUsuarios();
atualizarBotaoInstalacao();

if (window.location.protocol === "file:") {
  setTimeout(() => {
    mostrarToast("Para instalar o app, abra este projeto em localhost ou HTTPS.", "info");
  }, 300);
}
