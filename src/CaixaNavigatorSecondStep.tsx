import React from 'react';
import { SimulationOverlay } from './SimulationOverlay';
import './App.css';
import { SimulationPayload } from './lib/SimulationPayload';
import { autoMountNavigator } from './lib/autoMountNavigator';
import { BankMessenger } from './lib/BankMessenger';
import { MAX_AUTOMATION_ATTEMPTS } from './lib/constants';
import { CaixaHelpers } from './helpers/CaixaHelpers';

let logs: string[] = [];

function registerLog(message: string) {
	const timestampedMessage = `${message} -- [${new Date().toLocaleTimeString()}]`;
	logs.push(timestampedMessage);
}

function printLogs() {
	console.clear();
	logs.forEach(msg => console.log(msg));
}

export const CaixaNavigatorSecondStep: React.FC<{ data: Record<string, any> }> = ({ data }) => {

	const [isComplete, setIsComplete] = React.useState(false);
	const [isFailure, setIsFailure] = React.useState(false);
	const [failureMessage, setFailureMessage] = React.useState<string | null>(null);
	const hasSentResultsRef = React.useRef(false);
	const lastFailureContextRef = React.useRef<string | null>(null);
	const defaultFailureMessage = 'Erro não especificado';
	const ensureFailureMessage = (mensagem: unknown): string => {
		if (mensagem === undefined || mensagem === null) {
			return defaultFailureMessage;
		}
		const message = typeof mensagem === 'string' ? mensagem : String(mensagem);
		return message.length > 0 ? message : defaultFailureMessage;
	};

	const automationGuardId = React.useMemo(() => {
		const fields = (data as any)?.fields as Record<string, any> | undefined;
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
		return 'default';
	}, [data]);

	const automationGuardKey = React.useMemo(
		() => `__CAIXA_SECOND_STEP_GUARD_${automationGuardId}`,
		[automationGuardId]
	);

	const readAutomationGuard = React.useCallback((): string | null => {
		if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
			return null;
		}
		try {
			return window.sessionStorage.getItem(automationGuardKey);
		} catch {
			return null;
		}
	}, [automationGuardKey]);

	const writeAutomationGuard = React.useCallback((status: 'running' | 'completed') => {
		if (typeof window === 'undefined' || typeof window.sessionStorage === 'undefined') {
			return;
		}
		try {
			window.sessionStorage.setItem(automationGuardKey, status);
		} catch {
			// ignore storage quota issues so the automation can carry on
		}
	}, [automationGuardKey]);

	const formatFailureMessageWithContext = (mensagem: string, contexto?: string | null): string => {
		const normalized = ensureFailureMessage(mensagem);
		const trimmedContext = (contexto ?? '').toString().trim();
		if (!trimmedContext) {
			return normalized;
		}
		return `${normalized} (opção: ${trimmedContext})`;
	};

	const buildFailureEntry = (mensagem: string, contexto?: string) => {
		const trimmedContext = contexto?.toString().trim();
		if (trimmedContext) {
			lastFailureContextRef.current = trimmedContext;
		}
		return SimulationPayload.ensureEntry({ tipo_amortizacao: formatFailureMessageWithContext(mensagem, trimmedContext) }, 'caixa');
	};

	const sendFailureResult = async (mensagem: string, contexto?: string) => {
		if (hasSentResultsRef.current) {
			return;
		}

		const effectiveContext = (contexto ?? lastFailureContextRef.current) ?? undefined;
		const normalizedMessage = formatFailureMessageWithContext(mensagem, effectiveContext);
		const payload = new SimulationPayload('caixa', 'failure');
		payload.addEntry(buildFailureEntry(mensagem, effectiveContext));
		setIsFailure(true);
		setFailureMessage(normalizedMessage);
		const messengerResult = await BankMessenger.sendSimulationPayload(payload, {
			logPrefix: 'caixaNavigationSecondStep.js',
			registerLog,
			printLogs,
		});

		hasSentResultsRef.current = true;
		setIsComplete(true);
		writeAutomationGuard('completed');
		if (!messengerResult.confirmed) {
			
			registerLog(` Confirmação do background não recebida para a Caixa (requestId=${messengerResult.requestId}).`);
			printLogs();
		}
	};

	
	registerLog(`[CaixaNavigatorSecondStep] Dados recebidos: ${JSON.stringify(data)}`);
	const isCaixaPage = typeof window !== 'undefined' && /\.caixa\.gov\.br$/.test(window.location.hostname);
	const logger = React.useMemo(() => ({ registerLog, printLogs }), []);

	async function processFinancingOptions(): Promise<any> {
		
		registerLog(` URL Atual: ${window.location.href}`);
		registerLog(` Título da Página: ${document.title}`);

		try {
			// Verificação inicial de erro
		if (CaixaHelpers.checkForSecondStepErrorDialog(logger)) {
			const mensagem = 'A página da Caixa apresentou um aviso de erro antes de iniciar a coleta.';
			registerLog(` ${mensagem}`);
			throw new Error(mensagem);
		}
			
			registerLog('Aguardando 2 segundos para a página carregar totalmente...');
			await new Promise(resolve => setTimeout(resolve, 2000));

			// Verifica diálogo de erro após carregamento
		if (CaixaHelpers.checkForSecondStepErrorDialog(logger)) {
			const mensagem = 'A página da Caixa apresentou um aviso logo após o carregamento.';
			registerLog(` ${mensagem}`);
			throw new Error(mensagem);
		}

			const passo3 = document.querySelector('#passo3');
			
			registerLog(` Elemento #passo3 encontrado: ${!!passo3}`);

		if (!passo3) {
			const mensagem = 'A tela de opções da Caixa não carregou totalmente para continuar a simulação.';
			console.error(mensagem);
			registerLog(` ${mensagem}`);
			throw new Error(mensagem);
		}
			
			registerLog(' Procurando por links de opções de financiamento...');

			const optionLinks = document.querySelectorAll('a.js-form-next');
			
			registerLog(` Encontrados ${optionLinks.length} links js-form-next (sem filtro aplicado)`);


			Array.from(optionLinks).forEach((link, index) => {
				const text = link.textContent?.trim();
				const onclick = link.getAttribute('onclick');
				
				registerLog(` Link ${index + 1}: "${text}" - onclick: ${onclick?.substring(0, 100)}... temClasse: ${link.classList.contains('js-form-next')} tagName: ${link.tagName}`);
			});

		if (optionLinks.length === 0) {
			const mensagem = 'Nenhuma opção de financiamento foi localizada na página da Caixa.';
			console.error(mensagem);
			registerLog(` ${mensagem}`);
			throw new Error(mensagem);
		}

			const payload = new SimulationPayload('caixa');

			for (let i = 0; i < optionLinks.length; i++) {
				const link = optionLinks[i] as HTMLAnchorElement;
				const optionNameRaw = link.textContent?.trim();
				let optionName = optionNameRaw && optionNameRaw.length > 0 ? optionNameRaw : `Opção ${i + 1}`;
				const normalizedOptionName = CaixaHelpers.normalizeTipoAmortizacao(optionName);
				if (normalizedOptionName) {
					optionName = normalizedOptionName;
				} else if (/ATEN[ÇC][AÃ]O!?/i.test(optionName)) {
					optionName = `Opção ${i + 1}`;
				}

				if (optionName) {
					lastFailureContextRef.current = optionName;
				}

				if (optionName.toLowerCase().includes('clique aqui')) {
					
					registerLog(` Pulando link "clique aqui": "${optionName}"`);
					continue;
				}
				
				registerLog(` ===== Processando opção ${i + 1}/${optionLinks.length}: "${optionName}" =====`);

				// Verifica diálogo de erro antes de processar cada opção
			if (CaixaHelpers.checkForSecondStepErrorDialog(logger)) {
				const mensagem = 'A Caixa exibiu um aviso antes de coletar todas as opções.';
				registerLog(` ${mensagem}`);
				throw new Error(mensagem);
			}

				try {
					
					registerLog(` Executando script de destruição JS...`);
					const jsDestroyScript = `
						var elements = document.querySelectorAll('.erro_feedback');
						var contadorRemovidos = 0; 
						for (var i = 0; i < elements.length; i++) {
							if (elements[i].textContent.includes('Habite Seguro')) { // Lógica mantida
								elements[i].remove();
								contadorRemovidos++;
							}
						}
						return contadorRemovidos;
					`;

					const numRemoved = (window as any).eval(`(function() { ${jsDestroyScript} })()`);
					
					registerLog(` Destruição JS removeu ${numRemoved} elementos de erro indesejados`);
					
					registerLog(` Tentando clicar no link...`);

					let clickSuccess = false;

					try {
						link.click();
						
						registerLog(` Clique direto bem-sucedido`);
						printLogs();
						clickSuccess = true;
					} catch (error) {
						
						registerLog(` Clique direto falhou: ${error}`);
					}

					if (!clickSuccess) {
						try {
							const onclickAttr = link.getAttribute('onclick');
							if (onclickAttr) {
								
								registerLog(` Executando onclick diretamente: ${onclickAttr.substring(0, 100)}...`);
								(window as any).eval(onclickAttr);
								clickSuccess = true;
							}
						} catch (error) {
							
							registerLog(` Execução do Onclick falhou: ${error}`);
						}
					}

					if (!clickSuccess) {
						try {
							
							registerLog(` Tentando disparar evento de clique`);
							const event = new MouseEvent('click', { bubbles: true, cancelable: true });
							link.dispatchEvent(event);
							clickSuccess = true;
						} catch (error) {
							
							registerLog(` Disparo de evento falhou: ${error}`);
						}
					}

					if (!clickSuccess) {
						
						registerLog(` Todas as abordagens de clique falharam para a opção "${optionName}"`);
						continue;
					}
					
					registerLog(` Clique executado, aguardando resposta...`);
					await new Promise(resolve => setTimeout(resolve, 2000));

				if (CaixaHelpers.checkForSecondStepErrorDialog(logger)) {
					const mensagem = `A Caixa exibiu um erro ao abrir a opção "${optionName}".`;
					registerLog(` ${mensagem}`);
					throw new Error(mensagem);
				}
					
					registerLog(` Analisando resposta da página...`);
					const erroEls = Array.from(document.querySelectorAll('.erro_feedback'));
					
					registerLog(` Encontrados ${erroEls.length} elementos .erro_feedback`);

					let errorFound = false;

					if (erroEls.length > 0) {
						const previousCount = payload.entryCount();

						for (const e of erroEls) {
							const txtRaw = (e.textContent || '').trim();
							if (!txtRaw) continue;

							const elementId = e.id?.toLowerCase() || '';
							if (elementId.includes('divobservacao') || elementId.includes('divtextoexplicativo')) {
								
								registerLog(` Ignorando erro com ID informativo (${e.id}): ${txtRaw.substring(0, 200)}`);
								continue;
							}
							
							registerLog(` Capturado erro_feedback: ${txtRaw.substring(0, 400)}`);
							payload.addEntry(buildFailureEntry(txtRaw, optionName));
						}

						errorFound = payload.entryCount() > previousCount;
					}

					if (!errorFound) {
						if (erroEls.length > 0) {
							
							registerLog(` Nenhum erro relevante encontrado nas mensagens. Tentando extrair tabela de resultados.`);
						} else {
							
							registerLog(` Nenhum .erro_feedback encontrado; tentando extrair tabela de resultados`);
						}
						const tableData = await CaixaHelpers.extractTableData(optionName, logger);
						if (tableData) {
							
							registerLog(` Dados da tabela extraídos com sucesso`);
							printLogs();
							payload.addEntry(tableData);
						} else {
							
							registerLog(` Nenhum dado de tabela encontrado`);
						}
					}
					
					registerLog(` Voltando para a página de opções...`);
					printLogs();
					if (errorFound) {
						await CaixaHelpers.goBackFromErrorPage(logger);
					} else {
						await CaixaHelpers.goBackFromSuccessPage(logger);
					}

				} catch (error: any) {
					
					registerLog(` Erro ao processar opção "${optionName}": ${error.message}`);
					printLogs();
					payload.addEntry(buildFailureEntry(error.message, optionName));
					await CaixaHelpers.goBackFromErrorPage(logger);
				}
			}

			if (!payload.hasEntries()) {
				
				registerLog(' Nenhuma informação válida foi coletada nas opções da Caixa (resultado vazio).');
				printLogs();
			}

		const messengerResult = await BankMessenger.sendSimulationPayload(payload, {
			logPrefix: 'caixaNavigationSecondStep.js',
			registerLog,
			printLogs,
		});
		hasSentResultsRef.current = true;
		writeAutomationGuard('completed');
		if (!messengerResult.confirmed) {
			
			registerLog(` Confirmação do background não recebida para a Caixa (requestId=${messengerResult.requestId}).`);
			printLogs();
		}
		return payload.toJSON();

	} catch (error: any) {
		const mensagem = `Falha ao processar as opções da Caixa: ${error.message}`;
		registerLog(` ${mensagem}`);
		printLogs();
		throw new Error(mensagem);
	}
	}

	React.useEffect(() => {
		if (!isCaixaPage) {
			
			registerLog('[CaixaNavigatorSecondStep] Não está em caixa.gov.br, pulando automação');
			return;
		}

		const guardStatus = readAutomationGuard();
		if (guardStatus === 'completed') {
			registerLog('[CaixaNavigatorSecondStep] Automação já marcada como concluída nesta aba. Pulando reexecução.');
			setIsComplete(true);
			printLogs();
			return;
		}
		if (guardStatus === 'running') {
			registerLog('[CaixaNavigatorSecondStep] Automação já está em andamento segundo sessionStorage. Evitando nova execução.');
			printLogs();
			return;
		}

		if ((window as any).__CAIXA_SECOND_STEP_EXECUTED) {
			
			registerLog('[CaixaNavigatorSecondStep] Automação já executada, pulando');
			return;
		}

		writeAutomationGuard('running');

		const errorCheckInterval = setInterval(() => {
			CaixaHelpers.checkForSecondStepErrorDialog(logger);
		}, 1000);
		
		registerLog('[CaixaNavigatorSecondStep] Componente da segunda etapa carregado para processamento das opções de financiamento');
		printLogs();

		let lastFailureMessage: string | null = null;

		const runSecondStepAutomation = async () => {
			(window as any).__CAIXA_SECOND_STEP_EXECUTED = true;
			
			registerLog('Prestes a chamar processFinancingOptions()...');
			printLogs();

			let finalResult: any = null;
			for (let attempt = 1; attempt <= MAX_AUTOMATION_ATTEMPTS; attempt++) {
				
				registerLog(` processFinancingOptions tentativa ${attempt}/${MAX_AUTOMATION_ATTEMPTS}`);
				try {
					const optionsResult = await processFinancingOptions();
					
					registerLog(` processFinancingOptions concluído (tentativa ${attempt})`);
					if (optionsResult) {
						finalResult = optionsResult;
						break;
					} else {
						
						registerLog(` processFinancingOptions não retornou resultados na tentativa ${attempt}`);
					}
				} catch (error: any) {
					const detail = error instanceof Error ? error.message : String(error);
					lastFailureMessage = detail;
					
					registerLog(` ERRO em processFinancingOptions() tentativa ${attempt}: ${detail}`);
					printLogs();
				}

				if (attempt < MAX_AUTOMATION_ATTEMPTS) {
					
					registerLog(' Aguardando antes de tentar novamente...');
					await new Promise(resolve => setTimeout(resolve, 1500));
				}
			}

			if (finalResult) {
				setIsFailure(false);
				setFailureMessage(null);
				registerLog(`Processado com sucesso ${finalResult.result?.length || 0} opções de financiamento`);
				registerLog(`Resultado das Opções de Financiamento: ${JSON.stringify(finalResult, null, 2)}`);
			} else {
				
				registerLog('Todas as tentativas de processar as opções de financiamento falharam');
				if (!hasSentResultsRef.current) {
					const fallbackMessage = lastFailureMessage ?? 'Não foi possível concluir a simulação da Caixa.';
					await sendFailureResult(fallbackMessage, lastFailureContextRef.current ?? undefined);
				}
			}

			setIsComplete(true);
			writeAutomationGuard('completed');
			
			registerLog(' Sequência de automação da segunda etapa concluída.');
			printLogs();
		}

		// Adiciona um pequeno atraso para garantir que a página está totalmente carregada
		setTimeout(() => {
			runSecondStepAutomation();
		}, 1000);

		// Limpa o intervalo ao desmontar
		return () => {
			clearInterval(errorCheckInterval);
		};

	}, [isCaixaPage, readAutomationGuard, writeAutomationGuard, logger]);

	return (
		<SimulationOverlay
			title="Processando Opções"
			subtitle="Procurando opções de financiamento"
			bankName="Caixa Econômica Federal"
			bankIcon="ibb-caixa"
			isComplete={isComplete}
			isFailure={isFailure}
			failureMessage={failureMessage ?? undefined}
		>
			<div className="caixa-navigator">
				<p>Simulação da Caixa em processo.</p>
			</div>
		</SimulationOverlay>
	);
};


registerLog('[caixaNavigationSecondStep.js] Script carregado. Iniciando auto-mount...');

autoMountNavigator(CaixaNavigatorSecondStep, {
	containerId: 'caixa-navigator-second-step-root',
	logPrefix: 'caixaNavigationSecondStep.js',
	registerLog,
	printLogs,
});
