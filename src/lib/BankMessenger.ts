export interface BankMessengerOptions {
  messageType?: string;
  ackType?: string;
  timeoutMs?: number;
  logPrefix?: string;
  registerLog?: (message: string) => void;
  printLogs?: () => void;
}

export interface BankMessengerResult {
  requestId: string;
  confirmed: boolean;
}

type PayloadLike = { toJSON?: () => any } | Record<string, any>;

const defaultMessageType = 'CAIXA_TO_BACKGROUND';
const defaultAckType = 'BACKGROUND_TO_CAIXA';

export class BankMessenger {
  static async sendSimulationPayload(
    payload: PayloadLike,
    options: BankMessengerOptions = {}
  ): Promise<BankMessengerResult> {
    const {
      messageType = defaultMessageType,
      ackType = defaultAckType,
      timeoutMs = 15000,
      logPrefix = '',
      registerLog,
      printLogs,
    } = options;

    const prefix = logPrefix ? `${logPrefix} ` : '';
    const log = (message: string) => {
      if (typeof registerLog === 'function') {
        registerLog(`${prefix}${message}`);
      } else {
        console.log(`${prefix}${message}`);
      }
    };

    const normalized =
      payload && typeof (payload as any).toJSON === 'function'
        ? (payload as any).toJSON()
        : payload;

    const requestId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

    return new Promise<BankMessengerResult>((resolve) => {
      let confirmed = false;
      let timeoutId: number;

      const responseHandler = (event: MessageEvent) => {
        if (event.source !== window) return;
        if (event.data.type !== ackType) return;
        if (event.data.requestId !== requestId) return;

        window.removeEventListener('message', responseHandler);
        window.clearTimeout(timeoutId);
        confirmed = true;
        log(`Confirmação recebida do background (requestId=${requestId}).`);
        printLogs?.();
        resolve({ requestId, confirmed: true });
      };

      window.addEventListener('message', responseHandler);

      timeoutId = window.setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        if (!confirmed) {
          log(`Tempo de confirmação esgotado (requestId=${requestId}). Assumindo envio único.`);
          printLogs?.();
          resolve({ requestId, confirmed: false });
        }
      }, timeoutMs);

      log(`Enviando resultado ao background (requestId=${requestId})...`);
      printLogs?.();

      window.postMessage(
        {
          type: messageType,
          requestId,
          payload: {
            action: 'simulationResult',
            payload: normalized,
            requestId,
          },
        },
        '*'
      );
    });
  }
}
