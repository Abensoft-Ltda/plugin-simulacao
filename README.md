# Extensão de Automação de Simulações Habitacionais

Documentação do projeto **plugin-simulacao**, uma extensão Chrome construída em React + TypeScript para automatizar o preenchimento e a coleta de resultados de simuladores habitacionais (atualmente Caixa e Banco do Brasil) e reportar os dados processados ao portal Superleme.

---

## Sumário

- [Visão Geral](#visão-geral)
- [Principais Funcionalidades](#principais-funcionalidades)
- [Arquitetura do Código](#arquitetura-do-código)
- [Fluxo de Execução](#fluxo-de-execução)
- [Comunicação com o Superleme e APIs](#comunicação-com-o-superleme-e-apis)
- [Logs e Monitoramento](#logs-e-monitoramento)
- [Ambiente de Desenvolvimento](#ambiente-de-desenvolvimento)
- [Build e Distribuição](#build-e-distribuição)
- [Carregando a extensão no Chrome](#carregando-a-extensão-no-chrome)
- [Adicionando novos bancos](#adicionando-novos-bancos)
- [Estrutura de Pastas](#estrutura-de-pastas)
- [Dicas](#dicas)

---

## Visão Geral

A extensão injeta componentes React diretamente nos simuladores bancários para preencher formulários, coletar as opções disponibilizadas, monitorar erros de interface e enviar os resultados ao back-end do Superleme. Todo o fluxo é disparado a partir do `popup` da extensão, que dispara requisições para o *service worker* de fundo (`background.ts`). Esse service worker coordena a criação de novas abas, injeta os *navigators* específicos de cada banco e consolida as respostas para envio ao servidor.

---

## Principais Funcionalidades

- **Automação de simuladores bancários**: componentes como `CaixaNavigator.tsx` e `CaixaNavigatorSecondStep.tsx` preenchem formulários, navegam por etapas e extraem tabelas de resultados.
- **Overlay informativo**: `SimulationOverlay.tsx` apresenta um painel fixo no site do banco mostrando o status, erros e mensagens para o usuário.
- **Comunicação confiável com o background**: `BankMessenger` encapsula a troca de mensagens entre scripts injetados e o service worker, com confirmação e *timeout*.
- **Validação e roteamento de pedidos**: `background.ts` identifica o banco-alvo, lança uma nova aba e mantém o estado da automação por aba, controlando concorrência com `activeAutomations`.
- **Envio de resultados ao Superleme**: `SimulationResultService` normaliza dados, monta `SimulationPayload` e realiza *POST* autenticado para a API do Superleme.
- **Persistência de autenticação**: `AuthService` extrai cookies da aplicação Superleme, armazena com expiração e valida as credenciais antes de cada envio.
- **Registro de logs**: `lib/logger.ts` armazena logs no `chrome.storage.local`, permitindo acompanhamento pela interface (`LogViewer.tsx`).

---

## Arquitetura do Código

| Local | Papel |
|-------|-------|
| `src/background.ts` | Service worker MV3. Recebe comandos do `popup`, identifica o banco, abre novas abas, injeta scripts, envia resultados e trata autenticação. |
| `src/popup.tsx` & `src/methods/startAutomation.ts` | Interface do menu da extensão. Permite iniciar simulações, limpar logs e exibe o status ao operador. |
| `src/CaixaNavigator.tsx` & `src/CaixaNavigatorSecondStep.tsx` | Automação da Caixa (primeira e segunda etapa). Utiliza `CaixaHelpers` para preencher campos, lidar com diálogos e coletar tabelas. |
| `src/BBNavigator.tsx` | Automação específica do Banco do Brasil, reutilizando padrões das helpers e do overlay. |
| `src/helpers/*` | Utilitários de automação (espera de elementos, inputs naturais, tratamento de tabelas e mensagens). `CaixaHelpers` encapsula a lógica de interação com a interface da Caixa. |
| `src/lib/autoMountNavigator.ts` | Monta dinamicamente componentes React no contexto da página-alvo, criando o container quando necessário. |
| `src/lib/BankMessenger.ts` | Bilioteca de envio de payloads entre página e background com confirmação opcional. |
| `src/lib/SimulationPayload.ts` | Normaliza resultados (tipos, valores monetários, prazos) e garante formato consistente para a API. |
| `src/lib/SimulationResultService.ts` | Converte resultados em um corpo de requisição, persiste no `chrome.storage` e envia ao Superleme. |
| `src/lib/AuthService.ts` | Gera script para capturar cookies, armazena tokens e verifica se ainda são válidos (especialmente fora do modo desenvolvimento). |
| `src/lib/logger.ts` | Abstração de logs com schema `zod` para leitura/limpeza. |
| `src/config.ts` | Determina URLs e flags (dev/prod) a partir do tipo de instalação da extensão. |

Outros componentes como `SimulationOverlay.tsx`, `SuccessAnimation.tsx` e `LogViewer.tsx` cuidam da experiência visual e do acompanhamento durante a execução.

---

## Fluxo de Execução

1. **Operador inicia pelo popup**  
   Ao clicar em *Iniciar*, `startAutomation` dispara uma mensagem `startSimulationRequest` para o `background`, incluindo os campos necessários (dados do imóvel, renda, etc.).

2. **Service worker prepara a automação**  
   `background.ts` valida o alvo (`Caixa`, `BB`, etc.), abre uma nova aba no simulador correspondente e armazena o contexto em `activeAutomations`.

3. **Injeção e montagem do React Navigator**  
   Assim que a aba carrega, o background injeta scripts construídos em `dist/` (ex.: `caixaNavigation.js`). Esses scripts usam `autoMountNavigator` para montar os componentes React dentro da página. O componente renderizado mostra o `SimulationOverlay` e dispara os fluxos de preenchimento.

4. **Formulários, coleta e retorno**  
   Helpers aguardam elementos (`waitForElement`), digitam valores, monitoram mensagens de erro e extraem tabelas de resultados. Ao final, `BankMessenger.sendSimulationPayload` envia o resultado ao background, que por sua vez usa `SimulationResultService` para transmitir ao Superleme.

5. **Finalização e limpeza**  
   O background marca a aba como concluída, registra os logs e, se necessário, envia falhas (com mensagens amigáveis) para o servidor.

---

## Comunicação com o Superleme e APIs

- `AuthService` extrai cookies (`z.auth`, `cotonic-sid`, Hotjar, etc.) e mantém os dados em `chrome.storage.local` com expiração de 24h.
- Em ambientes de desenvolvimento (`chrome.management.getSelf().installType === "development"`), a validação é pulada para agilizar testes.
- `SimulationResultService` cria um `SimulationPayload`, converte para JSON, persiste localmente (`simulationResult`) e tenta enviar via `fetch` para `api/model/sl_cad_interacao_simulacao/post/insert_simulacao`.
- Timeouts ou erros 500 podem ser tratados como “ignorados”, evitando travar a automação. Logs detalhados ajudam a diagnosticar CORS e credenciais expiradas.

---

## Logs e Monitoramento

- `writeLog` adiciona timestamp e envia notificações para o popup/LogViewer.
- Logs são armazenados na chave `logHistory` do `chrome.storage.local`.
- `useAutomation` atualiza a lista de logs sempre que há mudanças no storage ou mensagens de background.
- O overlay em cada página usa `registerLog`/`printLogs` para mostrar contexto no console da aba, útil para depuração no DevTools do banco.

---

## Ambiente de Desenvolvimento

### Pré-requisitos

- Node.js 18+ (recomendado 20 LTS).
- npm (ou pnpm/yarn, adaptando os comandos).
- Google Chrome (para testes com extensões MV3).

### Instalação

```bash
npm install
```

### Comandos úteis

| Comando | Descrição |
|---------|-----------|
| `npm run dev` | Executa Vite em modo desenvolvimento (útil para testar componentes isolados). |
| `npm run watch` | Faz build contínuo para gerar arquivos em `dist/` enquanto você altera o código. |
| `npm run build` | Gera build de produção com TypeScript + Vite (necessário antes de empacotar a extensão). |
| `npm run lint` | Executa ESLint em todo o projeto. |

> **Dica**: durante o desenvolvimento da extensão, o fluxo típico é `npm run watch` para regenerar os bundles e recarregar a extensão no Chrome.

---

## Build e Distribuição

O Makefile já automatiza o empacotamento completo:

```bash
make build
```

Esse alvo cuida de instalar dependências, gerar a pasta `dist/` e organizar os artefatos em `_extensao/` (com ZIP e versão `plugin_unpacked`). Caso prefira executar manualmente, os passos são:

1. Atualizar o `version` em `package.json` e, se necessário, em `manifest.template.json`.
2. Rodar `npm run build` para gerar o conteúdo em `dist/`.
3. Conferir se todos os bundles usados nas injeções constam em `dist/` e nos `web_accessible_resources`.
4. Compactar `dist/` somente após validar localmente (útil para upload na Chrome Web Store).

---

## Carregando a extensão no Chrome

1. Execute `npm run build` ou `npm run watch` (para desenvolvimento).
2. Abra `chrome://extensions`.
3. Ative **Modo do desenvolvedor** (canto superior direito).
4. Clique em **Carregar sem compactação** e selecione a pasta `dist/`.
5. Após alterações no código, rode novamente o build/watch e clique em **Atualizar** na página de extensões.

---

## Adicionando novos bancos

1. **Roteamento**: atualize `resolveBankLabel` e o `switch` em `startBankSimulation` (`src/background.ts`) com a nova URL e rótulo normalizado.
2. **Navigator/Overlay**: crie um componente React similar a `CaixaNavigator`/`BBNavigator` e exponha funções helper específicas em `src/helpers`.
3. **Helpers**: caso necessário, crie helpers dedicados (`SantanderHelpers`, por exemplo) para encapsular seletores e interações.
4. **Manifesto**: inclua o domínio do banco em `host_permissions` e nos `matches` dos recursos acessíveis.
5. **Build**: garanta que o novo bundle entre na lista `web_accessible_resources` e seja injetado pelo background quando a aba detectar o domínio correspondente.

---

## Estrutura de Pastas

```
src/
├── background.ts           # Service worker MV3
├── popup.tsx               # Interface do popup
├── methods/
│   ├── startAutomation.ts  # Hook para iniciar simulações via popup
│   ├── Caixa.ts, BB.ts     # Funções específicas de cada banco
│   └── Validation.ts       # Validação de campos de entrada
├── helpers/
│   ├── CaixaHelpers.ts     # Utilitários de automação da Caixa
│   ├── BBHelpers.ts        # Utilitários do Banco do Brasil
│   └── Helpers.ts          # Funções genéricas (delay, formatação, etc.)
├── lib/
│   ├── AuthService.ts
│   ├── BankMessenger.ts
│   ├── SimulationPayload.ts
│   ├── SimulationResultService.ts
│   └── logger.ts
├── CaixaNavigator*.tsx     # Componentes React injeta­dos no simulador da Caixa
├── BBNavigator.tsx         # Componente do simulador BB
├── SimulationOverlay.tsx   # Overlay de status exibido dentro do site do banco
└── manifest.template.json  # Modelo usado pelo build para gerar manifest.json
```

---

## Dicas

- `registerLog` e `printLogs` ajudam a manter rastreabilidade durante execuções reais.
- Vale usar interações “naturais” sempre que possível (já há helpers como `simulateNaturalInput` e `simulateAutocomplete` para isso).
- `CaixaHelpers.normalizeTipoAmortizacao` evita mensagens em caixa alta com alertas remanescentes antes de mandar resultados ao servidor.
- Para depurar retornos, observe a chave `simulationResult` no `chrome.storage.local` e o console do service worker (`chrome://extensions > Service worker`).
- Ao preparar versões para produção, confira se `AuthService.validate()` consegue recuperar cookies válidos no ambiente final.

---

Sinta-se à vontade para expandir este README com instruções internas específicas da equipe (ex.: URLs de homologação, padrões de versionamento ou checklist de QA).
