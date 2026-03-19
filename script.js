"use strict";

/* =====================
   ESTADO GLOBAL
===================== */
let usuarioAtual = "";
let grafico = null;

/* =====================
   CRITÉRIO DE MENÇÃO
   <= 4        → I
   > 4 e <= 6  → R
   > 6 e <= 8  → B
   > 8 e <= 10 → MB
===================== */
function getMencao(nota) {
  if (nota <= 4)  return "I";
  if (nota <= 6)  return "R";
  if (nota <= 8)  return "B";
  return "MB";
}

function getCorMencao(mencao) {
  const cores = { MB: "#16a34a", B: "#2563eb", R: "#d97706", I: "#e53e3e" };
  return cores[mencao] || "#6b7280";
}

/* =====================
   USUÁRIOS
===================== */
function getUsuarios() {
  const salvo = localStorage.getItem("usuarios");
  if (salvo) return JSON.parse(salvo);
  const padrao = ["Maércio", "João", "Maria"];
  localStorage.setItem("usuarios", JSON.stringify(padrao));
  return padrao;
}

function salvarUsuarios(lista) {
  localStorage.setItem("usuarios", JSON.stringify(lista));
}

function carregarUsuarios() {
  const select = document.getElementById("listaUsuarios");
  if (!select) return;
  select.innerHTML = "";
  getUsuarios().forEach(u => {
    const opt = document.createElement("option");
    opt.value = u;
    opt.textContent = u;
    select.appendChild(opt);
  });
}

function cadastrarUsuario() {
  const input = document.getElementById("novoUsuario");
  const nome  = input.value.trim();

  if (!nome) {
    mostrarToast("Digite um nome para o usuário.", "erro");
    input.focus();
    return;
  }

  const lista = getUsuarios();
  if (lista.some(u => u.toLowerCase() === nome.toLowerCase())) {
    mostrarToast("Usuário já existe!", "erro");
    input.focus();
    return;
  }

  lista.push(nome);
  salvarUsuarios(lista);
  carregarUsuarios();
  document.getElementById("listaUsuarios").value = nome;
  input.value = "";
  mostrarToast(`Usuário "${nome}" criado!`, "sucesso");
}

/* =====================
   LOGIN / LOGOUT
===================== */
function login() {
  const sel  = document.getElementById("listaUsuarios");
  const nome = sel ? sel.value : "";

  if (!nome) {
    mostrarToast("Selecione um usuário.", "erro");
    return;
  }

  usuarioAtual = nome;
  document.getElementById("loginBox").style.display = "none";
  document.getElementById("sistema").style.display  = "block";
  document.getElementById("nomeUsuario").textContent = "👤 " + usuarioAtual;

  atualizarSelect();
  listar();
  gerarGrafico();
}

function confirmarLogout() {
  abrirModal({
    msg: "Deseja realmente sair?",
    onConfirm: () => location.reload()
  });
}

/* =====================
   DISCIPLINAS
===================== */
function getDisciplinas() {
  const raw = localStorage.getItem("disciplinas_" + usuarioAtual);
  return raw ? JSON.parse(raw) : [];
}

function salvarDisciplinas(lista) {
  localStorage.setItem("disciplinas_" + usuarioAtual, JSON.stringify(lista));
}

function cadastrarDisciplina() {
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
  salvarDisciplinas(lista);
  input.value = "";
  atualizarSelect();
  listar();
  gerarGrafico();
  mostrarToast("Disciplina cadastrada!", "sucesso");
}

function editarDisciplina(index) {
  const lista = getDisciplinas();
  abrirModal({
    msg: "Novo nome para a disciplina:",
    input: true,
    inputValor: lista[index].nome,
    onConfirm: (novoNome) => {
      novoNome = (novoNome || "").trim();
      if (!novoNome) {
        mostrarToast("O nome não pode estar vazio.", "erro");
        return;
      }
      if (lista.some((d, i) => i !== index && d.nome.toLowerCase() === novoNome.toLowerCase())) {
        mostrarToast("Já existe uma disciplina com esse nome!", "erro");
        return;
      }
      lista[index].nome = novoNome;
      salvarDisciplinas(lista);
      atualizarSelect();
      listar();
      gerarGrafico();
      mostrarToast("Disciplina renomeada!", "sucesso");
    }
  });
}

function excluirDisciplina(index) {
  const lista = getDisciplinas();
  abrirModal({
    msg: `Excluir "${lista[index].nome}"? Esta ação não pode ser desfeita.`,
    onConfirm: () => {
      lista.splice(index, 1);
      salvarDisciplinas(lista);
      atualizarSelect();
      listar();
      gerarGrafico();
      mostrarToast("Disciplina excluída.", "info");
    }
  });
}

/* =====================
   NOTAS
===================== */
function carregarNotasDisciplina() {
  const lista  = getDisciplinas();
  const index  = parseInt(document.getElementById("disciplinaSelect").value);
  const inputs = document.querySelectorAll(".nota");

  inputs.forEach((inp, i) => {
    inp.value = (!isNaN(index) && lista[index] && lista[index].notas[i] !== undefined)
      ? lista[index].notas[i]
      : "";
  });
}

function salvarNotas() {
  const lista  = getDisciplinas();
  const index  = parseInt(document.getElementById("disciplinaSelect").value);

  if (isNaN(index) || !lista[index]) {
    mostrarToast("Selecione uma disciplina!", "erro");
    return;
  }

  const inputs = document.querySelectorAll(".nota");
  const notas  = [];

  for (const inp of inputs) {
    if (inp.value === "") continue;
    const val = parseFloat(inp.value.replace(",", "."));
    if (isNaN(val) || val < 0 || val > 10) {
      mostrarToast(`Nota inválida: "${inp.value}". Use valores entre 0 e 10.`, "erro");
      inp.focus();
      return;
    }
    notas.push(val);
  }

  lista[index].notas = notas;
  salvarDisciplinas(lista);
  listar();
  gerarGrafico();
  mostrarToast("Notas salvas!", "sucesso");
}

/* =====================
   CÁLCULOS
===================== */
function calcularMedia(notas) {
  if (!notas || !notas.length) return null;
  const soma = notas.reduce((a, b) => a + b, 0);
  return parseFloat((soma / notas.length).toFixed(1));
}

/* =====================
   LISTAGEM
===================== */
function listar() {
  const lista = getDisciplinas();
  const div   = document.getElementById("listaDisciplinas");
  const empty = document.getElementById("semDisciplinas");
  div.innerHTML = "";

  if (!lista.length) {
    empty.style.display = "block";
    return;
  }

  empty.style.display = "none";

  lista.forEach((d, i) => {
    const media       = calcularMedia(d.notas);
    const mencao      = media !== null ? getMencao(media) : null;
    const detalhe     = d.notas && d.notas.length ? d.notas.join(" · ") : "sem notas";
    const badgeClass  = mencao || "NA";
    const badgeLabel  = mencao || "S/N";
    const mediaLabel  = media !== null ? media : "—";

    const row = document.createElement("div");
    row.className = "resultado";
    row.innerHTML = `
      <div class="resultado-info">
        <strong>${d.nome}</strong>
        <span class="notas-detalhe">${detalhe}</span>
      </div>
      <div class="resultado-direita">
        <div class="media-box">
          <span class="media-valor">${mediaLabel}</span>
          <span class="badge ${badgeClass}">${badgeLabel}</span>
        </div>
        <button class="btn-icon btn-edit" title="Editar disciplina" onclick="editarDisciplina(${i})">✏️</button>
        <button class="btn-icon btn-del"  title="Excluir disciplina" onclick="excluirDisciplina(${i})">🗑️</button>
      </div>`;
    div.appendChild(row);
  });
}

/* =====================
   SELECT DISCIPLINAS
===================== */
function atualizarSelect() {
  const lista  = getDisciplinas();
  const select = document.getElementById("disciplinaSelect");
  select.innerHTML = "";

  lista.forEach((d, i) => {
    const opt = document.createElement("option");
    opt.value = i;
    opt.textContent = d.nome;
    select.appendChild(opt);
  });

  carregarNotasDisciplina();
}

/* =====================
   GRÁFICO
===================== */
function gerarGrafico() {
  const lista = getDisciplinas();
  const ctx   = document.getElementById("graficoDisciplinas");

  const labels = lista.map(d => d.nome);
  const dados  = lista.map(d => calcularMedia(d.notas) ?? 0);
  const cores  = dados.map(v => getCorMencao(getMencao(v)));

  if (grafico) grafico.destroy();

  grafico = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Média",
        data: dados,
        backgroundColor: cores,
        borderRadius: 6,
        borderSkipped: false
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: c => {
              const media  = c.parsed.y;
              const mencao = getMencao(media);
              return ` Média: ${media}  |  Menção: ${mencao}`;
            }
          }
        }
      },
      scales: {
        y: {
          min: 0, max: 10,
          ticks: { stepSize: 2 },
          grid: { color: "rgba(0,0,0,0.05)" }
        },
        x: { grid: { display: false } }
      }
    }
  });
}

/* =====================
   PDF
===================== */
function exportarPDF() {
  const { jsPDF } = window.jspdf;
  const doc   = new jsPDF();
  const lista = getDisciplinas();

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.text("Boletim Escolar — " + usuarioAtual, 14, 18);

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(120);
  doc.text("Gerado em: " + new Date().toLocaleDateString("pt-BR"), 14, 26);

  doc.setTextColor(0);
  doc.setFontSize(11);

  // Cabeçalho da tabela
  doc.setFont("helvetica", "bold");
  doc.text("Disciplina", 14, 38);
  doc.text("Notas", 80, 38);
  doc.text("Média", 130, 38);
  doc.text("Menção", 160, 38);
  doc.setFont("helvetica", "normal");
  doc.line(14, 40, 196, 40);

  let y = 48;
  lista.forEach(d => {
    const media       = calcularMedia(d.notas);
    const mencao      = media !== null ? getMencao(media) : "S/N";
    const notasStr    = d.notas && d.notas.length ? d.notas.join(", ") : "—";
    const mediaStr    = media !== null ? String(media) : "—";

    doc.text(d.nome,    14,  y);
    doc.text(notasStr,  80,  y);
    doc.text(mediaStr,  130, y);
    doc.text(mencao,    160, y);
    y += 10;

    if (y > 270) {
      doc.addPage();
      y = 20;
    }
  });

  doc.save("boletim_" + usuarioAtual + ".pdf");
  mostrarToast("PDF gerado!", "sucesso");
}

/* =====================
   DARK MODE
===================== */
function toggleDarkMode() {
  document.body.classList.toggle("dark");
  document.getElementById("btnDark").textContent =
    document.body.classList.contains("dark") ? "☀️" : "🌙";
}

/* =====================
   MODAL DINÂMICO
===================== */
function abrirModal({ msg, input = false, inputValor = "", onConfirm }) {
  const anterior = document.getElementById("modalDinamico");
  if (anterior) anterior.remove();

  const overlay = document.createElement("div");
  overlay.id    = "modalDinamico";
  overlay.className = "modal-overlay";

  overlay.innerHTML = `
    <div class="modal-box animate">
      <p>${msg}</p>
      ${input ? `<input id="modalInput" type="text" value="${inputValor}" placeholder="Digite aqui...">` : ""}
      <div class="modal-acoes">
        <button id="modalBtnConfirmar" class="btn-danger">Confirmar</button>
        <button id="modalBtnCancelar"  class="btn-secondary">Cancelar</button>
      </div>
    </div>`;

  document.body.appendChild(overlay);

  if (input) {
    const inp = document.getElementById("modalInput");
    inp.focus();
    inp.select();
    inp.addEventListener("keydown", e => {
      if (e.key === "Enter") document.getElementById("modalBtnConfirmar").click();
    });
  }

  document.getElementById("modalBtnConfirmar").addEventListener("click", () => {
    const valor = input ? document.getElementById("modalInput").value : null;
    fecharModal();
    onConfirm(valor);
  });

  document.getElementById("modalBtnCancelar").addEventListener("click", fecharModal);

  overlay.addEventListener("click", e => {
    if (e.target === overlay) fecharModal();
  });
}

function fecharModal() {
  const m = document.getElementById("modalDinamico");
  if (m) m.remove();
}

/* =====================
   TOAST
===================== */
function mostrarToast(msg, tipo = "info") {
  const toast = document.createElement("div");
  toast.className = "toast " + tipo;
  toast.textContent = msg;
  document.body.appendChild(toast);
  setTimeout(() => toast.classList.add("show"), 50);
  setTimeout(() => {
    toast.classList.remove("show");
    setTimeout(() => toast.remove(), 300);
  }, 2800);
}

/* =====================
   SERVICE WORKER
===================== */
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/service-worker.js")
      .then(() => console.log("✅ SW registrado"))
      .catch(err => console.warn("SW erro:", err));
  });
}

/* =====================
   INIT
===================== */
carregarUsuarios();