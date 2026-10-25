import { cleanLabel, type DocKind } from '../../editors/docs';
import type { DocTemplate } from '../../editors/templates';
import { blankCode, normalizeCode, type CodeState } from './model';

export const codeKind: DocKind<CodeState> = {
  type: 'code', prefix: 'v2-code-', appName: 'Código',
  normalize: normalizeCode, label: (s) => cleanLabel(s.name, 'Projeto de código')
};
const page = (title: string, body: string, scriptTag = true): string =>
  '<!doctype html>\n<html lang="pt-BR">\n<head>\n  <meta charset="utf-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title>' + title + '</title>\n  <link rel="stylesheet" href="style.css">\n</head>\n<body>\n' + body + (scriptTag ? '  <script src="script.js"></script>\n' : '') + '</body>\n</html>\n';

export const codeTemplates: DocTemplate<CodeState>[] = [
  { id: 'ola', name: 'Olá, mundo', description: 'Página mínima com HTML, CSS e JavaScript ligados', create: () => blankCode('Olá, mundo') },
  {
    id: 'contador', name: 'Contador', description: 'Botões que mudam um número na tela',
    create: () => ({
      name: 'Contador', auto: true, tabSize: 2,
      html: page('Contador', '  <main>\n    <h1>Contador</h1>\n    <p id="valor" aria-live="polite">0</p>\n    <button id="menos">−1</button>\n    <button id="mais">+1</button>\n    <button id="zerar">Zerar</button>\n  </main>\n'),
      css: 'body { font-family: system-ui, sans-serif; display: grid; place-items: center; min-height: 100vh; margin: 0; background: #f3f5f9; }\nmain { text-align: center; }\n#valor { font-size: 4rem; font-weight: 800; margin: .5rem 0 1rem; }\nbutton { font: inherit; padding: .6rem 1rem; border-radius: .6rem; border: 1px solid #99a; background: #fff; cursor: pointer; }\nbutton:hover { background: #e8eefc; }\n',
      js: "let n = 0;\nconst valor = document.getElementById('valor');\nfunction mostrar() { valor.textContent = n; console.log('valor:', n); }\ndocument.getElementById('mais').onclick = () => { n++; mostrar(); };\ndocument.getElementById('menos').onclick = () => { n--; mostrar(); };\ndocument.getElementById('zerar').onclick = () => { n = 0; mostrar(); };\n"
    })
  },
  {
    id: 'cartao', name: 'Cartão de apresentação', description: 'Só HTML e CSS, bom para treinar estilos',
    create: () => ({
      name: 'Cartão de apresentação', auto: true, tabSize: 2,
      html: page('Cartão', '  <article class="cartao">\n    <h1>Maria Souza</h1>\n    <p class="cargo">Desenvolvedora web</p>\n    <p>Rua das Flores, 100 · São Paulo</p>\n    <p><a href="#">maria@exemplo.com</a></p>\n  </article>\n', false),
      css: 'body { display: grid; place-items: center; min-height: 100vh; margin: 0; background: linear-gradient(135deg, #4c8df6, #976df7); font-family: Georgia, serif; }\n.cartao { background: #fff; padding: 2rem 2.5rem; border-radius: 1rem; box-shadow: 0 20px 40px rgb(0 0 0 / 25%); max-width: 22rem; }\n.cartao h1 { margin: 0; }\n.cargo { color: #4c5bd4; font-weight: 700; }\n',
      js: ''
    })
  },
  {
    id: 'tarefas', name: 'Lista de tarefas', description: 'Adicionar e concluir itens com JavaScript',
    create: () => ({
      name: 'Lista de tarefas', auto: true, tabSize: 2,
      html: page('Tarefas', '  <main>\n    <h1>Tarefas</h1>\n    <form id="form"><input id="texto" placeholder="Nova tarefa" aria-label="Nova tarefa" required><button>Adicionar</button></form>\n    <ul id="lista"></ul>\n  </main>\n'),
      css: 'body { font-family: system-ui, sans-serif; max-width: 28rem; margin: 2rem auto; padding: 0 1rem; }\nform { display: flex; gap: .5rem; }\ninput { flex: 1; padding: .5rem; font: inherit; }\nli { padding: .4rem 0; cursor: pointer; }\nli.feito { text-decoration: line-through; color: #778; }\n',
      js: "const lista = document.getElementById('lista');\ndocument.getElementById('form').addEventListener('submit', (e) => {\n  e.preventDefault();\n  const campo = document.getElementById('texto');\n  const li = document.createElement('li');\n  li.textContent = campo.value;\n  li.onclick = () => li.classList.toggle('feito');\n  lista.append(li);\n  console.log('adicionada:', campo.value);\n  campo.value = '';\n});\n"
    })
  }
];
