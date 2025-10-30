import React from 'react';
import './App.css';
import { SimulationOverlay } from './SimulationOverlay';
import { SimulationPayload } from './lib/SimulationPayload';
import { autoMountNavigator } from './lib/autoMountNavigator';
import { BankMessenger } from './lib/BankMessenger';
import { MAX_AUTOMATION_ATTEMPTS } from './lib/constants';
import { Helpers } from './helpers/Helpers';
import { BBHelpers } from './helpers/BBHelpers';

declare global {
  interface Window {
    jQuery?: any;
  }
}

let logs: string[] = [];

function registerLog(message: string) {
  const timestampedMessage = `${message} -- [${new Date().toLocaleTimeString()}]`;
  logs.push(timestampedMessage);
}

function printLogs() {
  console.clear();
  logs.forEach(msg => console.log(msg));
}

export const BBNavigator: React.FC<{ data: Record<string, any> }> = ({ data }) => {

  // Cache for select lookup tables
  const selectCache = React.useRef<Map<string, {
    lookup: Record<string, string>;
    optionsHash: string;
  }>>(new Map());
  const hasSentResultsRef = React.useRef(false);

  registerLog(` Dados recebidos: ${JSON.stringify(data)}`);
  const isBBPage = typeof window !== 'undefined' && /bb.com.br$/.test(window.location.hostname);

  const fields = data.fields;
  registerLog(` Usando campos: ${JSON.stringify(fields)}`);
  const [isComplete, setIsComplete] = React.useState(false);
  const [isFailure, setIsFailure] = React.useState(false);
  const [failureMessage, setFailureMessage] = React.useState<string | null>(null);

  const logger = React.useMemo(() => ({ registerLog, printLogs }), []);

  async function sendFailureResult(message: string): Promise<void> {
    if (hasSentResultsRef.current) {
      return;
    }

    const normalizeFailure = (raw: string | undefined | null): string => {
      if (raw === undefined || raw === null) {
        return 'Não foi possível concluir a simulação no Banco do Brasil.';
      }
      const message = typeof raw === 'string' ? raw : String(raw);
      return message.length > 0 ? message : 'Não foi possível concluir a simulação no Banco do Brasil.';
    };

    const mensagemFinal = normalizeFailure(message);
    setIsFailure(true);
    setFailureMessage(mensagemFinal);
    const payload = new SimulationPayload('bb', 'failure');
    payload.addFailure(mensagemFinal);

    const messengerResult = await BankMessenger.sendSimulationPayload(payload, {
      logPrefix: 'bbNavigation.js',
      registerLog,
      printLogs,
    });

    hasSentResultsRef.current = true;
    setIsComplete(true);
    registerLog(mensagemFinal);
    if (!messengerResult.confirmed) {
      registerLog(` Confirmação do background não recebida (requestId=${messengerResult.requestId}).`);
    }
    printLogs();
  }
  async function waitForResultsAndSend(targetFields: Record<string, any>): Promise<void> {
    if (hasSentResultsRef.current) {
      return;
    }

    const desiredTab = BBHelpers.resolveDesiredPropertyTab(targetFields);
    registerLog(` Waiting for Banco do Brasil simulation results (expected tab: ${desiredTab}).`);
    printLogs();

    const entryNumeric = BBHelpers.resolveEntryNumeric(targetFields);
    const entryDigits = entryNumeric !== null ? String(Math.round(entryNumeric * 100)) : '';
    const entryCurrency = entryNumeric !== null
      ? entryNumeric.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
      : null;
    const entryCurrencyValue = entryCurrency ?? 'R$ 0,00';

    const MAX_RESULT_POLL_ATTEMPTS = 3;
    let lastStatusMessage: string | null = null;

    for (let attempt = 1; attempt <= MAX_RESULT_POLL_ATTEMPTS && !hasSentResultsRef.current; attempt++) {
      const tabGroup = await BBHelpers.locateSuggestionTabGroup(5000);
      if (tabGroup) {
        const { contentRoot, selectedTab } = await BBHelpers.ensurePropertyTabActive(tabGroup, desiredTab, logger);
        if (contentRoot) {
          const results = BBHelpers.extractCardResultsFromRoot(contentRoot, selectedTab, entryCurrencyValue);
          if (results.length > 0) {
            let customSimulation: Record<string, any> | null = null;
            if (entryDigits) {
              try {
                customSimulation = await BBHelpers.runCustomSimulationFlow(targetFields, entryDigits, entryCurrency, logger, selectCache.current);
                if (customSimulation) {
                  results.push(customSimulation);
                }
              } catch (error: any) {
                registerLog(` Custom simulation flow failed: ${error?.message || error}`);
                printLogs();
              }
            } else {
              registerLog(' Skipping custom simulation step: no valor_entrada available.');
              printLogs();
            }
            const payload = new SimulationPayload('bb');
            payload.addEntries(results);
            const sendResult = await BankMessenger.sendSimulationPayload(payload, {
              logPrefix: 'bbNavigation.js',
              registerLog,
              printLogs,
            });
            hasSentResultsRef.current = true;
            setIsFailure(false);
            setFailureMessage(null);
            registerLog(` BB simulation results captured (${results.length} opções).`);
            if (!sendResult.confirmed) {
              registerLog(` Confirmação do background não recebida para o BB (requestId=${sendResult.requestId}).`);
            }
            printLogs();
            return;
          } else {
            const message = `Attempt ${attempt}/${MAX_RESULT_POLL_ATTEMPTS}: suggestion tab "${selectedTab}" did not yield cards yet. Waiting for cards...`;
            if (message !== lastStatusMessage) {
              registerLog(message);
              printLogs();
              lastStatusMessage = message;
            }
          }
        } else {
          const message = `Attempt ${attempt}/${MAX_RESULT_POLL_ATTEMPTS}: Banco do Brasil suggestion content root not available. Retrying...`;
          if (message !== lastStatusMessage) {
            registerLog(message);
            printLogs();
            lastStatusMessage = message;
          }
        }
      } else {
        const message = `Attempt ${attempt}/${MAX_RESULT_POLL_ATTEMPTS}: suggestion tab group not found yet. Waiting...`;
        if (message !== lastStatusMessage) {
          registerLog(message);
          printLogs();
          lastStatusMessage = message;
        }
      }
      if (!hasSentResultsRef.current && attempt < MAX_RESULT_POLL_ATTEMPTS) {
        await Helpers.delay(1200);
      }
    }

    if (!hasSentResultsRef.current) {
      const aviso = 'A página do Banco do Brasil demorou para retornar as opções de simulação.';
      const detalhe = lastStatusMessage ? ` ${lastStatusMessage}` : '';
      registerLog(` ${aviso}${detalhe ? ` (${detalhe})` : ''} Nenhum resultado foi enviado.`);
      printLogs();
      throw new Error(`${aviso}${detalhe ? ` (${detalhe})` : ''}`);
    }
  }

  React.useEffect(() => {
    if (!isBBPage) {
      registerLog(' Not on bb.com.br, skipping automation');
      return;
    }

    registerLog(' useEffect triggered for BB automation.');

    let lastFailureMessage: string | null = null;

    const runAutomation = async (): Promise<boolean> => {
      try {
        registerLog(' Iniciando sequência de automação do Banco do Brasil.');
        await Helpers.delay(3000);

        if (BBHelpers.checkForErrorDialog(logger)) {
          throw new Error('A página do Banco do Brasil exibiu avisos antes do início da simulação. Revise os dados e tente novamente.');
        }

        registerLog(' Aguardando o campo CPF ficar disponível...');
        const cpfKeyElement = await BBHelpers.waitForElement('bb-text-field[formcontrolname="cpf"] input, input[formcontrolname="cpf"], input[placeholder*="CPF"]');
        if (!cpfKeyElement) {
          throw new Error('Um ou mais campos do Banco do Brasil não carregaram corretamente (CPF não disponível).');
        }

        registerLog(' Primeira etapa pronta. Preenchendo campos.');
        printLogs();

        await fillFirstPage(fields);

        if (BBHelpers.checkForErrorDialog(logger)) {
          throw new Error('O Banco do Brasil apresentou avisos de inconsistência nesta etapa da simulação.');
        }

        const nextButton = await BBHelpers.waitForElementEnabled('#botao, button#botao, button.bb-button.primary', 8000);
        if (nextButton) {
          registerLog(' Tentando clicar em "Prosseguir".');
          (nextButton as HTMLElement).click();
          await Helpers.delay(1500);
        } else {
          throw new Error('Não foi possível avançar: o botão "Prosseguir" do Banco do Brasil permaneceu indisponível.');
        }

        registerLog(' Primeira etapa da automação do BB concluída.');
        printLogs();

        await waitForResultsAndSend(fields);
        setIsComplete(true);
        return true;
      } catch (err: any) {
        const mensagem = err instanceof Error ? err.message : String(err);
        const detalhe = mensagem || 'Não foi possível concluir a automação do Banco do Brasil.';
        registerLog(` Falha na automação do BB: ${detalhe}`);
        printLogs();
        lastFailureMessage = detalhe;
        return false;
      }
    };

    (async () => {
      let abortRetries = false;
      for (let attempt = 1; attempt <= MAX_AUTOMATION_ATTEMPTS; attempt++) {
        registerLog(` Executando tentativa ${attempt}/${MAX_AUTOMATION_ATTEMPTS} da automação do BB`);
        try {
          const concluido = await runAutomation();
          if (concluido) {
            registerLog(` Automação do BB finalizada na tentativa ${attempt}`);
            break;
          }
        } catch (attemptError: any) {
          const detail = attemptError instanceof Error ? attemptError.message : String(attemptError);
          registerLog(` Falha na tentativa ${attempt} da automação do BB: ${detail}`);
          printLogs();
        }
        if (!hasSentResultsRef.current) {
          if (attempt < MAX_AUTOMATION_ATTEMPTS && !abortRetries) {
            await Helpers.delay(1500);
            registerLog(' Aguardando para tentar novamente a automação do BB...');
          } else {
            registerLog(' Automação do BB não obteve êxito após as tentativas configuradas.');
            break;
          }
        }
      }

      if (!hasSentResultsRef.current) {
        const finalMessage = lastFailureMessage ?? 'O Banco do Brasil não retornou resultados durante a automação.';
        await sendFailureResult(finalMessage);
      }
    })();

  }, [isBBPage, JSON.stringify(fields)]);


  async function fillFirstPage(fields: Record<string, any>) {
    registerLog(' Filling BB first page...');

    const fieldStatus: Record<string, 'filled' | 'failed' | 'missing-data'> = {};

    if (fields.cpf) {
      const cpfDigits = String(fields.cpf).replace(/\D/g, '');
      const cpfValue = Helpers.maskCPF(String(fields.cpf));
      registerLog(` Prepared CPF value. Digits: "${cpfDigits}", masked: "${cpfValue}"`);
      printLogs();
      const cpfFilled = await BBHelpers.withSelectors(
        [
          'bb-text-field[formcontrolname="cpf"] input',
          'input[formcontrolname="cpf"]',
          'input[id*="cpf"]',
          'input[placeholder*="CPF"]'
        ],
        async (selector) => BBHelpers.simulateNaturalInput(
          selector,
          cpfDigits,
          logger,
          120,
          3,
          {
            typePerChar: true,
            clearExisting: true,
            perCharDelay: 80,
            finalValueCheck: (finalValue) => finalValue.replace(/\D/g, '') === cpfDigits,
          }
        ),
        'CPF',
        logger
      );
      fieldStatus.cpf = cpfFilled ? 'filled' : 'failed';
      if (!cpfFilled) {
        registerLog(' CPF field could not be validated as filled.');
        printLogs();
      }
    } else {
      registerLog(' Skipping CPF: value not provided in payload.');
      printLogs();
      fieldStatus.cpf = 'missing-data';
    }

    if (fields.valor_imovel) {
      const formattedValue = Helpers.formatCurrencyFromCents(String(fields.valor_imovel));
      const valorFilled = await BBHelpers.withSelectors(
        [
          'bb-money-field[formcontrolname="valor"] input',
          'bb-money-field[formcontrolname="valor"] .bb-textfield-group input',
          'input[formcontrolname="valor"]',
          'input[id*="valor"]',
          '#card-body input[placeholder="0,00"]'
        ],
        async (selector) => {
          return BBHelpers.simulateNaturalInput(selector, formattedValue, logger);
        },
        'Valor do imóvel',
        logger
      );
      await Helpers.delay(300);
      fieldStatus.valor_imovel = valorFilled ? 'filled' : 'failed';
      if (!valorFilled) {
        registerLog(' Valor do imóvel field could not be validated as filled.');
        printLogs();
      }
    } else {
      registerLog(' Skipping Valor do imóvel: value not provided in payload.');
      printLogs();
      fieldStatus.valor_imovel = 'missing-data';
    }

    if (fields.uf) {
      const ufFilled = await BBHelpers.selectFromDropdown('uf', String(fields.uf), logger);
      await Helpers.delay(800);
      fieldStatus.uf = ufFilled ? 'filled' : 'failed';
      if (!ufFilled) {
        registerLog(' UF dropdown selection could not be validated.');
        printLogs();
      }
    } else {
      registerLog(' Skipping UF: value not provided in payload.');
      printLogs();
      fieldStatus.uf = 'missing-data';
    }

    if (fields.cidade) {
      const cidadeFilled = await BBHelpers.selectFromDropdown('municipio', String(fields.cidade), logger);
      await Helpers.delay(500);
      fieldStatus.cidade = cidadeFilled ? 'filled' : 'failed';
      if (!cidadeFilled) {
        registerLog(' Município dropdown selection could not be validated.');
        printLogs();
      }
    } else {
      registerLog(' Skipping Município: value not provided in payload.');
      printLogs();
      fieldStatus.cidade = 'missing-data';
    }

    const failedFields = Object.entries(fieldStatus)
      .filter(([, status]) => status === 'failed')
      .map(([name]) => name);

    const missingFields = Object.entries(fieldStatus)
      .filter(([, status]) => status === 'missing-data')
      .map(([name]) => name);

    if (failedFields.length === 0) {
      registerLog(' All tracked fields have been filled successfully.');
    } else {
      const failureMessage = ` Verification complete. Fields pending or empty: ${failedFields.join(', ')}`;
      registerLog(failureMessage);
      printLogs();
      throw new Error(`Os campos obrigatórios do Banco do Brasil não foram preenchidos corretamente: ${failedFields.join(', ')}`);
    }

    if (missingFields.length > 0) {
      registerLog(` Fields skipped due to missing data: ${missingFields.join(', ')}`);
    }
    printLogs();

    registerLog(' Finished filling BB first page.');
    printLogs();
  }

  return (
    <SimulationOverlay
      title="Processando opções e obtendo resultados"
      subtitle="Preenchendo formulário automaticamente"
      bankName="Banco do Brasil"
      bankIcon="ibb-banco-brasil"
      isComplete={isComplete}
      isFailure={isFailure}
      failureMessage={failureMessage ?? undefined}
    >
      <div className="bb-navigator">
        <p>Simulação do Banco do Brasil em processo.</p>
      </div>
    </SimulationOverlay>
  );
};

registerLog('[bbNavigation.js] Script loaded. Starting auto-mount...');

autoMountNavigator(BBNavigator, {
  containerId: 'bb-navigator-root',
  logPrefix: 'bbNavigation.js',
  registerLog,
  printLogs,
});
