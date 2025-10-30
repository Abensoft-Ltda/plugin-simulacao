import React from "react";
import "./App.css";
import { SimulationOverlay } from "./SimulationOverlay";
import { autoMountNavigator } from "./lib/autoMountNavigator";
import { MAX_AUTOMATION_ATTEMPTS } from "./lib/constants";
import { Helpers } from "./helpers/Helpers";
import { CaixaHelpers } from "./helpers/CaixaHelpers";

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

    const logger = React.useMemo(() => ({ registerLog, printLogs }), []);

    const automationGuardId = React.useMemo(() => {
        const candidates = [
            (data as any)?.startTime,
            fields?.startTime,
            fields?.id,
            fields?.simulacao_id,
            fields?.simId,
        ];
        for (const value of candidates) {
            if (value === undefined || value === null) continue;
            const text = String(value).trim();
            if (text.length > 0) {
                return text;
            }
        }
        return "default";
    }, [data, fields]);

    const automationGuardKey = React.useMemo(
        () => `__CAIXA_FIRST_STEP_GUARD_${automationGuardId}`,
        [automationGuardId]
    );

    const readAutomationGuard = React.useCallback((): string | null => {
        if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
            return null;
        }
        try {
            return window.sessionStorage.getItem(automationGuardKey);
        } catch {
            return null;
        }
    }, [automationGuardKey]);

    const writeAutomationGuard = React.useCallback(
        (status: "running" | "completed") => {
            if (typeof window === "undefined" || typeof window.sessionStorage === "undefined") {
                return;
            }
            try {
                window.sessionStorage.setItem(automationGuardKey, status);
            } catch {
            }
        },
        [automationGuardKey]
    );

    // Função para processar todas as opções de financiamento e extrair dados agora está em CaixaNavigatorSecondStep.tsx

    React.useEffect(() => {
        if (!isCaixaPage) {
            registerLog(" Não está em caixa.gov.br, pulando automação");
            return;
        }

        const guardStatus = readAutomationGuard();
        if (guardStatus === "completed") {
            registerLog(" Automação da Caixa já concluída nesta aba. Pulando reexecução.");
            printLogs();
            return;
        }
        if (guardStatus === "running") {
            registerLog(" Automação da Caixa já está marcada como em andamento. Evitando nova execução.");
            printLogs();
            return;
        }

        writeAutomationGuard("running");

        // Removido o setInterval para evitar race condition
        // const errorCheckInterval = setInterval(() => {
        //     checkForErrorDialog();
        // }, 1000); // Verifica a cada segundo

        registerLog(" useEffect disparado para automação.");

        const runAutomation = async () => {
            registerLog(" Iniciando sequência de automação.");

            //  Aguardar página estar pronta
            registerLog(" Aguardando 2 segundos para a página carregar totalmente...");
            await Helpers.delay(2000);

            //  Preencher a primeira página
            registerLog(" Aguardando o primeiro formulário ficar pronto...");
            const firstPageKeyElement = await CaixaHelpers.waitForElement("#valorImovel");
            if (!firstPageKeyElement) {
                registerLog(" Automação falhou: Formulário da primeira página não carregou.");
                // Não pare aqui, deixe o loop de retry cuidar disso
                throw new Error("Formulário da primeira página não carregou.");
            }
            registerLog(" Primeira página pronta. Preenchendo campos.");
            printLogs();
            await fillFirstPage(fields);

            // Apenas chama a função. Ela lançará um erro se encontrar o diálogo.
            CaixaHelpers.checkForErrorDialog(logger);

            const nextButton1 = await CaixaHelpers.waitForElement("#btn_next1");
            if (!nextButton1) {
                registerLog(
                    ' Automação falhou: Botão "Próxima" não encontrado na primeira página.'
                );
                throw new Error("Botão 'Próxima' (1) não encontrado.");
            }
            registerLog(' Clicando em "Próxima etapa".');
            (nextButton1 as HTMLElement).click();
            await Helpers.delay(2000); // Espera maior após o clique

            // Apenas chama a função. Ela lançará um erro se encontrar o diálogo.
            CaixaHelpers.checkForErrorDialog(logger);

            //  Preencher a segunda página
            registerLog(" Aguardando o segundo formulário ficar pronto...");
            const secondPageKeyElement = await CaixaHelpers.waitForElement("#dataNascimento"); // Um campo na segunda página
            if (!secondPageKeyElement) {
                registerLog(" Automação falhou: Formulário da segunda página não carregou.");
                throw new Error("Formulário da segunda página não carregou.");
            }
            registerLog(" Segunda página pronta. Preenchendo campos.");
            printLogs();
            await fillSecondPage(fields);

            // Apenas chama a função. Ela lançará um erro se encontrar o diálogo.
            CaixaHelpers.checkForErrorDialog(logger);

            const nextButton2 = await CaixaHelpers.waitForElement("#btn_next2"); // ID atualizado do HTML
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
            try {
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
                            await Helpers.delay(2000);
                        }
                    }
                }
            } finally {
                writeAutomationGuard("completed");
            }
        };

        executeAutomationWithRetries();

        // Limpa o intervalo ao desmontar
        return () => {
            // clearInterval(errorCheckInterval);
        };
    }, [isCaixaPage, JSON.stringify(fields), readAutomationGuard, writeAutomationGuard]);

    async function fillFirstPage(fields: Record<string, any>) {
        registerLog(" Preenchendo primeira página...");
        registerLog(" Clicando no radio button para PF...");

        // Selecionar tipo de pessoa (sempre Física)
        registerLog(" Selecionando tipo de pessoa: Física");
        const selector = "#pessoaF";
        const el = document.querySelector(selector) as HTMLInputElement;
        if (el) {
            el.click();
            await Helpers.delay(1500);
        } else {
            registerLog(` Botão radio de tipo de pessoa não encontrado: ${selector}`);
        }

        if (fields.categoria) {
            registerLog(` Preenchendo #tipoImovel com categoria: ${fields.categoria}`);
            await CaixaHelpers.simulateNaturalInput("#tipoImovel", Helpers.capitalizeWords(fields.categoria), logger);
        }
        // Apesar dos nomes dos campos, o TipoImovel acima é preenchido com fields.categoria

        registerLog(" Aguardando #grupoTipoFinanciamento ficar habilitado...");
        await CaixaHelpers.waitForElementEnabled("#grupoTipoFinanciamento_input");
        if (fields.tipo_imovel) {
            registerLog(
                ` Preenchendo #grupoTipoFinanciamento com tipo específico: ${fields.tipo_imovel}`
            );
            await CaixaHelpers.simulateNaturalInput("#grupoTipoFinanciamento_input", Helpers.capitalizeWords(fields.tipo_imovel), logger);
        }

        // Preencher valor_imovel
        if (fields.valor_imovel) {
            await CaixaHelpers.simulateNaturalInput("#valorImovel", fields.valor_imovel, logger);
        }

        // Preencher UF
        if (fields.uf) {
            await CaixaHelpers.simulateNaturalInput("#uf", fields.uf.toUpperCase(), logger);
        }

        // Preencher cidade
        if (fields.cidade) {
            // Isso também depende da seleção de UF.
            await Helpers.delay(1500); // Aguardar 1.5s para o dropdown dependente ser populado
            registerLog(` Preenchendo cidade: ${fields.cidade}`);
            await CaixaHelpers.simulateAutocomplete("#cidade", fields.cidade.toUpperCase(), logger, selectCache.current);
        }

        // Preencher checkbox possui_imovel
        if (fields.possui_imovel === "sim") {
            registerLog(" Marcando possui_imovel");
            const checkbox = document.querySelector(
                "#imovelCidade"
            ) as HTMLInputElement;
            if (checkbox && !checkbox.checked) {
                checkbox.click();
                await Helpers.delay(1500); // Espera maior
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
            await CaixaHelpers.setInstantValue("#dataNascimento", fields.data_nascimento, logger);
        }

        // Preencher renda_familiar
        if (fields.renda_familiar) {
            await CaixaHelpers.simulateNaturalInput("#rendaFamiliarBruta", fields.renda_familiar, logger);
        }

        // Preencher checkbox beneficiado_fgts
        if (fields.beneficiado_fgts === "sim") {
            registerLog(" Marcando beneficiado_fgts");
            const checkbox = document.querySelector(
                "#vaContaFgtsS"
            ) as HTMLInputElement;
            if (checkbox && !checkbox.checked) {
                checkbox.click();
                await Helpers.delay(1500); // Espera maior
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
