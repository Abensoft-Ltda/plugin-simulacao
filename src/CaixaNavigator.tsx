import React from "react";
import "./App.css";
import { SimulationOverlay } from "./SimulationOverlay";
import { autoMountNavigator } from "./lib/autoMountNavigator";
import { MAX_AUTOMATION_ATTEMPTS } from "./lib/constants";

declare global {
    interface Window {
        jQuery?: any;
    }
}

let logs: string[] = [];

function registerLog(message: string) {
    logs.push(message);
}

function printLogs() {
    console.clear();
    logs.forEach((msg) => console.log(msg));
}

export const CaixaNavigator: React.FC<{ data: Record<string, any> }> = ({
                                                                            data,
                                                                        }) => {
    // Cache para tabelas de pesquisa de selects
    const selectCache = React.useRef<
        Map<
            string,
            {
                lookup: Record<string, string>;
                optionsHash: string;
            }
        >
    >(new Map());

    registerLog(` Dados recebidos: ${JSON.stringify(data)}`);
    const isCaixaPage =
        typeof window !== "undefined" &&
        /\.caixa\.gov\.br$/.test(window.location.hostname);

    const fields = data.fields;
    registerLog(` Usando campos: ${JSON.stringify(fields)}`);

    // Utilitário para aguardar por um elemento chave antes de preencher
    function waitForElement(
        selector: string,
        timeout = 10000
    ): Promise<Element | null> {
        return new Promise((resolve) => {
            const start = Date.now();
            function check() {
                const el = document.querySelector(selector);
                if (el) return resolve(el);
                if (Date.now() - start > timeout) return resolve(null);
                setTimeout(check, 200);
            }
            check();
        });
    }

    // Verifica se há diálogos de erro e LANÇA um erro se encontrado
    function checkForErrorDialog(): void {
        // Verifica qualquer diálogo com o texto específico
        const allDialogs = document.querySelectorAll(
            '.ui-dialog-content, [class*="ui-dialog"]'
        );
        for (const dialog of allDialogs) {
            const dialogText = dialog.textContent?.trim();
            if (dialogText?.includes("Campo obrigatório não informado")) {
                registerLog(
                    `Diálogo de erro encontrado com a classe "${dialog.className}" contendo o texto de erro - fechando e tentando novamente`
                );
                closeParentDialog(dialog);
                // LANÇA O ERRO AQUI para parar a execução e pular para a próxima tentativa
                throw new Error("Diálogo de 'Campo obrigatório não informado' detectado.");
            }
        }
        // Não retorna nada se nenhum erro for encontrado
    }

    function closeParentDialog(node: Element | null): void {
        if (!node) return;
        const dialogContainer = node.closest(".ui-dialog") as HTMLElement | null;
        const closeButton = dialogContainer?.querySelector(
            ".ui-dialog-titlebar-close"
        ) as HTMLButtonElement | null;

        if (closeButton) {
            closeButton.click();
            registerLog(" Diálogo de erro fechado pelo botão de fechar do título.");
        } else if (dialogContainer) {
            dialogContainer.style.display = "none";
            registerLog(" Ocultado contêiner do diálogo (botão de fechar não encontrado).");
        }
    }

    function waitForElementEnabled(
        selector: string,
        timeout = 10000
    ): Promise<Element | null> {
        return new Promise((resolve) => {
            const start = Date.now();
            function check() {
                const el = document.querySelector(selector) as HTMLInputElement;
                if (el && !el.disabled) return resolve(el);
                if (Date.now() - start > timeout) return resolve(null);
                setTimeout(check, 200);
            }
            check();
        });
    }

    // Define valor instantâneo para todos os tipos de input
    async function setInstantValue(
        selector: string,
        value: string,
        isSelect = false
    ) {
        const el = document.querySelector(selector) as
            | HTMLInputElement
            | HTMLSelectElement;
        if (!el) {
            registerLog(` Elemento não encontrado: ${selector}`);
            return;
        }

        registerLog(` Definindo ${selector} instantaneamente para: "${value}"`);

        if (isSelect) {
            // Para elementos select, encontra a option e a define
            const select = el as HTMLSelectElement;
            const option = Array.from(select.options).find(
                (opt) =>
                    opt.text.toLowerCase().includes(value.toLowerCase()) ||
                    opt.value.toLowerCase().includes(value.toLowerCase())
            );
            if (option) {
                select.value = option.value;
                registerLog(
                    ` Opção selecionada: "${option.text}" (valor: ${option.value})`
                );
            }
        } else {
            // Para inputs normais
            el.value = value;
        }

        el.dispatchEvent(new Event("change", { bubbles: true }));
        el.dispatchEvent(new Event("input", { bubbles: true }));
        await new Promise((resolve) => setTimeout(resolve, 100));
    }

    async function simulateNaturalInput(
        selector: string,
        value: string,
        delay = 500,
        retries = MAX_AUTOMATION_ATTEMPTS
    ) {
        for (let i = 0; i < retries; i++) {
            try {
                const el = document.querySelector(selector) as
                    | HTMLInputElement
                    | HTMLSelectElement;
                if (!el) {
                    throw new Error(`Elemento não encontrado para o seletor: ${selector}`);
                }

                registerLog(
                    ` Simulando input para ${selector} com valor "${value}" (Tentativa ${
                        i + 1
                    })`
                );
                const wait = (ms: number) =>
                    new Promise((resolve) => setTimeout(resolve, ms));

                const dispatchEvent = (element: Element, eventName: string) => {
                    element.dispatchEvent(
                        new Event(eventName, { bubbles: true, cancelable: true })
                    );
                };

                let targetInput = el as HTMLInputElement;
                if (el.tagName === "SELECT") {
                    const comboboxInput = document.querySelector(
                        `#${el.id}_input`
                    ) as HTMLInputElement;
                    if (comboboxInput) {
                        targetInput = comboboxInput;
                    }
                }

                targetInput.click();
                targetInput.focus();
                targetInput.value = value;
                dispatchEvent(targetInput, "input");
                dispatchEvent(targetInput, "change");
                // dispatchEvent(targetInput, 'keydown'); // Removido keydown genérico
                await wait(delay);

                const enterEventDown = new KeyboardEvent("keydown", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                });
                const enterEventPress = new KeyboardEvent("keypress", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                });
                const enterEventUp = new KeyboardEvent("keyup", {
                    key: "Enter",
                    code: "Enter",
                    keyCode: 13,
                    which: 13,
                    bubbles: true,
                    cancelable: true,
                });

                registerLog(
                    ` Simulando "Enter" (1ª vez) para ${selector}.`
                );
                targetInput.dispatchEvent(enterEventDown);
                targetInput.dispatchEvent(enterEventPress);
                targetInput.dispatchEvent(enterEventUp);
                await wait(200);

                registerLog(
                    ` Simulando "Enter" (2ª vez) para ${selector}.`
                );
                targetInput.dispatchEvent(enterEventDown);
                targetInput.dispatchEvent(enterEventPress);
                targetInput.dispatchEvent(enterEventUp);

                // Também dispara um evento change no select original, se existir
                if (el.tagName === "SELECT") {
                    dispatchEvent(el, "change");
                }

                targetInput.blur();

                await wait(delay);

                let finalValue = "";
                if (el.tagName === "SELECT") {
                    // Para comboboxes, o valor visível está no elemento _input
                    const comboboxInput = document.querySelector(
                        `#${el.id}_input`
                    ) as HTMLInputElement;
                    if (comboboxInput) {
                        finalValue = comboboxInput.value;
                    } else {
                        // Fallback para selects padrão
                        finalValue = (el as HTMLSelectElement).value;
                    }
                } else {
                    // Para inputs padrão
                    finalValue = (el as HTMLInputElement).value;
                }

                if (finalValue.trim() !== "") {
                    registerLog(
                        ` Sucesso: ${selector} tem o valor "${finalValue}". Assumindo sucesso.`
                    );
                    printLogs();
                    return;
                } else {
                    throw new Error(
                        `Falha ao verificar valor para ${selector}. Campo está vazio.`
                    );
                }
            } catch (error: any) {
                registerLog(
                    ` Tentativa ${i + 1} falhou para ${selector}: ${error.message}`
                );
                printLogs();
                if (i === retries - 1) {
                    throw new Error(
                        ` Todas as ${retries} tentativas falharam para o seletor: ${selector}`
                    );
                }
                await new Promise((resolve) => setTimeout(resolve, 1000));
            }
        }
    }

    async function simulateAutocomplete(
        selector: string,
        value: string,
        delay = 500
    ) {
        try {
            const el = document.querySelector(selector) as HTMLSelectElement;
            if (!el) {
                throw new Error(`Elemento não encontrado para o seletor: ${selector}`);
            }

            registerLog(` Preparando seleção de ${selector} com valor "${value}"`);
            const wait = (ms: number) =>
                new Promise((resolve) => setTimeout(resolve, ms));

            const dispatchEvent = (element: Element, eventName: string) => {
                element.dispatchEvent(
                    new Event(eventName, { bubbles: true, cancelable: true })
                );
            };

            const options = el.querySelectorAll("option");
            const optionsHash = Array.from(options)
                .map((opt) => opt.value + ":" + opt.textContent)
                .join("|");

            let cityLookup: Record<string, string>;
            const cached = selectCache.current.get(selector);

            if (cached && cached.optionsHash === optionsHash) {
                // Cache hit! Usando tabela de pesquisa existente
                cityLookup = cached.lookup;
                registerLog(
                    ` Usando cache de pesquisa para ${selector} (${
                        Object.keys(cityLookup).length
                    } cidades)`
                );
            } else {
                // Cache miss - construindo nova tabela de pesquisa
                cityLookup = {};
                registerLog(
                    ` Construindo nova tabela de pesquisa para ${selector} (${options.length} opções)...`
                );

                for (let i = 0; i < options.length; i++) {
                    const option = options[i];
                    const optionText = option.textContent?.trim().toUpperCase() || "";
                    const optionValue = option.value;
                    if (optionText && optionValue) {
                        cityLookup[optionText] = optionValue;
                    }
                }

                selectCache.current.set(selector, {
                    lookup: cityLookup,
                    optionsHash: optionsHash,
                });
                registerLog(
                    ` Cache de pesquisa salvo com ${Object.keys(cityLookup).length} cidades`
                );
            }

            const normalizedValue = value.trim().toUpperCase();
            let optionValue = cityLookup[normalizedValue];
            let matchedCity = normalizedValue;

            if (!optionValue) {
                // Correspondência parcial rápida - pré-extrai chaves para evitar chamadas repetidas de Object.keys
                const cityNames = Object.keys(cityLookup);

                // Tenta correspondência de substring (caso mais comum) - loop otimizado
                for (let i = 0; i < cityNames.length; i++) {
                    const cityName = cityNames[i];
                    if (cityName.includes(normalizedValue)) {
                        optionValue = cityLookup[cityName];
                        matchedCity = cityName;
                        break;
                    }
                }

                // Se ainda sem correspondência, tenta 'contains' reverso (menos comum)
                if (!optionValue) {
                    for (let i = 0; i < cityNames.length; i++) {
                        const cityName = cityNames[i];
                        if (normalizedValue.includes(cityName)) {
                            optionValue = cityLookup[cityName];
                            matchedCity = cityName;
                            break;
                        }
                    }
                }

                if (optionValue) {
                    registerLog(` Correspondência encontrada: "${normalizedValue}" → "${matchedCity}"`);
                }
            }

            if (!optionValue) {
                // Registra cidades disponíveis para depuração
                const availableCities = Object.keys(cityLookup).slice(0, 10).join(", ");
                registerLog(` Cidades disponíveis (10 primeiras): ${availableCities}...`);
                throw new Error(`Cidade "${value}" não encontrada nas opções disponíveis`);
            }

            // Também atualiza o campo de input se for um combobox e clica na opção correspondente
            const comboboxInputId = el.getAttribute("inputid") || `${el.id}_input`;
            const comboboxInput = document.querySelector(
                `#${comboboxInputId}`
            ) as HTMLInputElement;
            let usedClick = false;

            if (comboboxInput) {
                comboboxInput.focus();
                comboboxInput.value = "";
                dispatchEvent(comboboxInput, "input");

                const typeKey = async (char: string) => {
                    const key = char;
                    const upper = char.toUpperCase();
                    const code =
                        upper >= "A" && upper <= "Z"
                            ? `Key${upper}`
                            : char === " "
                                ? "Space"
                                : undefined;
                    comboboxInput.dispatchEvent(
                        new KeyboardEvent("keydown", {
                            key,
                            code,
                            bubbles: true,
                            cancelable: true,
                        })
                    );
                    comboboxInput.value = `${comboboxInput.value}${char}`;
                    dispatchEvent(comboboxInput, "input");
                    comboboxInput.dispatchEvent(
                        new KeyboardEvent("keyup", {
                            key,
                            code,
                            bubbles: true,
                            cancelable: true,
                        })
                    );
                    await wait(40);
                };

                for (const char of matchedCity) {
                    await typeKey(char);
                }

                const menuId = comboboxInput.getAttribute("aria-owns");
                let suggestion: HTMLElement | null = null;
                for (let attempt = 0; attempt < 10 && !suggestion; attempt++) {
                    await wait(120);
                    let menu: HTMLElement | null = null;
                    if (menuId) {
                        menu = document.getElementById(menuId) as HTMLElement | null;
                    }
                    if (!menu) {
                        menu = document.querySelector(
                            ".ui-autocomplete:not([style*='display: none'])"
                        ) as HTMLElement | null;
                    }
                    if (!menu) {
                        continue;
                    }
                    const items = Array.from(
                        menu.querySelectorAll("li.ui-menu-item")
                    ) as HTMLElement[];
                    const normalizedTarget = matchedCity.toUpperCase();
                    suggestion =
                        items.find((item) => {
                            const text = item.textContent?.trim().toUpperCase() || "";
                            return text.includes(normalizedTarget);
                        }) || null;
                }

                if (suggestion) {
                    registerLog(
                        ` Clicando na sugestão "${suggestion.textContent
                            ?.trim()
                            .toUpperCase()}" para ${selector}`
                    );
                    const clickable =
                        (suggestion.querySelector("a") as HTMLElement | null) || suggestion;
                    clickable.click();
                    usedClick = true;
                    await wait(delay);
                } else {
                    registerLog(
                        ` Nenhuma sugestão encontrada para ${selector}. Usando seleção direta.`
                    );
                }
            } else {
                registerLog(
                    ` Input do combobox não encontrado para ${selector}. Usando seleção direta.`
                );
            }

            if (!usedClick) {
                el.value = optionValue;
                dispatchEvent(el, "change");
                if (comboboxInput) {
                    comboboxInput.value = matchedCity;
                    dispatchEvent(comboboxInput, "input");
                    dispatchEvent(comboboxInput, "change");
                }
                await wait(delay);
            } else {
                dispatchEvent(el, "change");
            }

            // Verifica a seleção
            const selectedOption = el.selectedOptions[0];
            if (selectedOption && selectedOption.value === optionValue) {
                registerLog(
                    ` Sucesso: Definido ${selector} para "${selectedOption.text}" (valor: ${optionValue})`
                );
                printLogs();
            } else {
                throw new Error(`Falha ao definir o valor para ${selector}`);
            }
        } catch (error: any) {
            registerLog(` Falha ao definir ${selector}: ${error.message}`);
            printLogs();
            throw error;
        }
    }

    // Função para processar todas as opções de financiamento e extrair dados agora está em CaixaNavigatorSecondStep.tsx

    React.useEffect(() => {
        if (!isCaixaPage) {
            registerLog(" Não está em caixa.gov.br, pulando automação");
            return;
        }

        // Removido o setInterval para evitar race condition
        // const errorCheckInterval = setInterval(() => {
        //     checkForErrorDialog();
        // }, 1000); // Verifica a cada segundo

        registerLog(" useEffect disparado para automação.");

        const runAutomation = async () => {
            registerLog(" Iniciando sequência de automação.");

            //  Aguardar página estar pronta
            registerLog(" Aguardando 2 segundos para a página carregar totalmente...");
            await new Promise((resolve) => setTimeout(resolve, 2000));

            //  Preencher a primeira página
            registerLog(" Aguardando o primeiro formulário ficar pronto...");
            const firstPageKeyElement = await waitForElement("#valorImovel");
            if (!firstPageKeyElement) {
                registerLog(" Automação falhou: Formulário da primeira página não carregou.");
                // Não pare aqui, deixe o loop de retry cuidar disso
                throw new Error("Formulário da primeira página não carregou.");
            }
            registerLog(" Primeira página pronta. Preenchendo campos.");
            printLogs();
            await fillFirstPage(fields);

            // Apenas chama a função. Ela lançará um erro se encontrar o diálogo.
            checkForErrorDialog();

            const nextButton1 = await waitForElement("#btn_next1");
            if (!nextButton1) {
                registerLog(
                    ' Automação falhou: Botão "Próxima" não encontrado na primeira página.'
                );
                throw new Error("Botão 'Próxima' (1) não encontrado.");
            }
            registerLog(' Clicando em "Próxima etapa".');
            (nextButton1 as HTMLElement).click();
            await new Promise((resolve) => setTimeout(resolve, 2000)); // Espera maior após o clique

            // Apenas chama a função. Ela lançará um erro se encontrar o diálogo.
            checkForErrorDialog();

            //  Preencher a segunda página
            registerLog(" Aguardando o segundo formulário ficar pronto...");
            const secondPageKeyElement = await waitForElement("#dataNascimento"); // Um campo na segunda página
            if (!secondPageKeyElement) {
                registerLog(" Automação falhou: Formulário da segunda página não carregou.");
                throw new Error("Formulário da segunda página não carregou.");
            }
            registerLog(" Segunda página pronta. Preenchendo campos.");
            printLogs();
            await fillSecondPage(fields);

            // Apenas chama a função. Ela lançará um erro se encontrar o diálogo.
            checkForErrorDialog();

            const nextButton2 = await waitForElement("#btn_next2"); // ID atualizado do HTML
            if (!nextButton2) {
                registerLog(
                    ' Automação falhou: Botão "Próxima" não encontrado na segunda página.'
                );
                throw new Error("Botão 'Próxima' (2) não encontrado.");
            }
            registerLog(' Clicando em "Próxima etapa" para ir às opções.');
            (nextButton2 as HTMLElement).click();

            registerLog(
                " Sequência de automação da primeira parte concluída. A segunda parte será tratada por CaixaNavigatorSecondStep.tsx"
            );
            printLogs();
        };

        const executeAutomationWithRetries = async () => {
            for (let attempt = 1; attempt <= MAX_AUTOMATION_ATTEMPTS; attempt++) {
                try {
                    await runAutomation();
                    return; // Sucesso, sai do loop
                } catch (err) {
                    const message = err instanceof Error ? err.message : String(err);
                    registerLog(
                        ` Tentativa de automação ${attempt} falhou: ${message}`
                    );
                    printLogs();

                    if (attempt === MAX_AUTOMATION_ATTEMPTS) {
                        registerLog(
                            ` Um erro crítico parou a automação: ${message}`
                        );
                        printLogs();
                    } else {
                        registerLog(
                            ` Retentando automação (tentativa ${
                                attempt + 1
                            }/${MAX_AUTOMATION_ATTEMPTS}) após um breve atraso.`
                        );
                        printLogs();
                        await new Promise((resolve) => setTimeout(resolve, 2000));
                    }
                }
            }
        };

        executeAutomationWithRetries();

        // Limpa o intervalo ao desmontar
        return () => {
            // clearInterval(errorCheckInterval);
        };
    }, [isCaixaPage, JSON.stringify(fields)]);

    const capitalizeWords = (str: string) => {
        if (!str) return "";
        return str
            .toLowerCase()
            .split(" ")
            .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
            .join(" ");
    };

    async function fillFirstPage(fields: Record<string, any>) {
        registerLog(" Preenchendo primeira página...");
        registerLog(" Clicando no radio button para PF...");

        // Selecionar tipo de pessoa (sempre Física)
        registerLog(" Selecionando tipo de pessoa: Física");
        const selector = "#pessoaF";
        const el = document.querySelector(selector) as HTMLInputElement;
        if (el) {
            el.click();
            await new Promise((resolve) => setTimeout(resolve, 1500));
        } else {
            registerLog(` Botão radio de tipo de pessoa não encontrado: ${selector}`);
        }

        if (fields.tipo_imovel) {
            registerLog(` Preenchendo #tipoImovel com categoria: ${fields.tipo_imovel}`);
            await simulateNaturalInput(
                "#tipoImovel",
                capitalizeWords(fields.tipo_imovel)
            );
        }

        registerLog(" Aguardando #grupoTipoFinanciamento ficar habilitado...");
        await waitForElementEnabled("#grupoTipoFinanciamento_input");

        if (fields.categoria_imovel) {
            registerLog(
                ` Preenchendo #grupoTipoFinanciamento com tipo específico: ${fields.categoria_imovel}`
            );
            await simulateNaturalInput(
                "#grupoTipoFinanciamento_input",
                capitalizeWords(fields.categoria_imovel)
            );
        }

        // Preencher valor_imovel
        if (fields.valor_imovel) {
            await simulateNaturalInput("#valorImovel", fields.valor_imovel);
        }

        // Preencher UF
        if (fields.uf) {
            await simulateNaturalInput("#uf", fields.uf.toUpperCase());
        }

        // Preencher cidade
        if (fields.cidade) {
            // Isso também depende da seleção de UF.
            await new Promise((resolve) => setTimeout(resolve, 1500)); // Aguardar 1.5s para o dropdown dependente ser populado
            registerLog(` Preenchendo cidade: ${fields.cidade}`);
            await simulateAutocomplete("#cidade", fields.cidade.toUpperCase());
        }

        // Preencher checkbox possui_imovel
        if (fields.possui_imovel === "sim") {
            registerLog(" Marcando possui_imovel");
            const checkbox = document.querySelector(
                "#imovelCidade"
            ) as HTMLInputElement;
            if (checkbox && !checkbox.checked) {
                checkbox.click();
                await new Promise((resolve) => setTimeout(resolve, 1500)); // Espera maior
            } else {
                registerLog(" Checkbox imovelCidade não encontrado ou já marcado");
            }
        }
        registerLog(" Terminou de preencher a primeira página.");
    }

    async function fillSecondPage(fields: Record<string, any>) {
        registerLog(" Preenchendo segunda página...");

        // Preencher data_nascimento
        if (fields.data_nascimento) {
            await setInstantValue("#dataNascimento", fields.data_nascimento);
        }

        // Preencher renda_familiar
        if (fields.renda_familiar) {
            await simulateNaturalInput("#rendaFamiliarBruta", fields.renda_familiar);
        }

        // Preencher checkbox beneficiado_fgts
        if (fields.beneficiado_fgts === "sim") {
            registerLog(" Marcando beneficiado_fgts");
            const checkbox = document.querySelector(
                "#vaContaFgtsS"
            ) as HTMLInputElement;
            if (checkbox && !checkbox.checked) {
                checkbox.click();
                await new Promise((resolve) => setTimeout(resolve, 1500)); // Espera maior
            } else {
                registerLog(" Checkbox vaContaFgtsS não encontrado ou já marcado");
            }
        }
        registerLog(" Terminou de preencher a segunda página.");
    }

    return (
        <SimulationOverlay
            title="Simulação Caixa"
            subtitle="Preenchendo formulário automaticamente"
            bankName="Caixa Econômica Federal"
            bankIcon="ibb-caixa"
        >
            <div className="caixa-navigator">
                <p>Simulação da Caixa em processo.</p>
            </div>
        </SimulationOverlay>
    );
};

registerLog("[caixaNavigation.js] Script carregado. Iniciando auto-mount...");

autoMountNavigator(CaixaNavigator, {
    containerId: "caixa-navigator-root",
    logPrefix: "caixaNavigation.js",
    registerLog,
    printLogs,
});