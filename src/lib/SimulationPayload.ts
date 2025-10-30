export interface SimulacaoEntry {
  tipo_amortizacao: string | null;
  prazo: string | number | null;
  valor_total: string | number | null;
  valor_entrada: string | number | null;
  juros_nominais: string | number | null;
  juros_efetivos: string | number | null;
}

const baseEntry = (): SimulacaoEntry => ({
  tipo_amortizacao: null,
  prazo: null,
  valor_total: null,
  valor_entrada: null,
  juros_nominais: null,
  juros_efetivos: null,
});

const sanitizeText = (value: any): string | null => {
  if (value === null || value === undefined) return null;
  const text = String(value).trim();
  return text.length > 0 ? text : null;
};

const normalizeIfName = (raw: any): string => {
  const text = sanitizeText(raw) ?? 'unknown';
  const lower = text.toLowerCase();
  if (lower === '104' || lower.includes('caixa')) return 'caixa';
  if (lower === '1' || lower.includes('banco do brasil') || lower.includes('bb')) return 'bb';
  return lower;
};

const normalizeStatus = (raw: any): 'success' | 'failure' =>
  (sanitizeText(raw) ?? 'success').toLowerCase() === 'failure' ? 'failure' : 'success';

const cleanMonetaryValue = (value: any): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  let cleaned = value.replace(/[R$\s]/g, '');
  cleaned = cleaned.replace(/\./g, '').replace(/,/g, '.');
  const parsed = parseFloat(cleaned);
  return Number.isFinite(parsed) ? parsed : null;
};

const cleanPrazo = (value: any): number | null => {
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return null;
  const digits = value.replace(/\D/g, '');
  const parsed = parseInt(digits, 10);
  return Number.isFinite(parsed) ? parsed : null;
};

const FIELD_MAP: Record<keyof SimulacaoEntry, string[]> = {
  tipo_amortizacao: ['tipo_amortizacao', 'amortizationType'],
  prazo: ['prazo', 'term'],
  valor_total: ['valor_total', 'totalValue'],
  valor_entrada: ['valor_entrada', 'entryValue'],
  juros_nominais: ['juros_nominais', 'nominalRate'],
  juros_efetivos: ['juros_efetivos', 'effectiveRate'],
};

const monetaryFields = new Set<keyof SimulacaoEntry>(['valor_total', 'valor_entrada']);

export class SimulationPayload {
  private readonly ifName: string;
  private statusValue: 'success' | 'failure';
  private readonly entries: SimulacaoEntry[] = [];

  constructor(ifName: string, status: 'success' | 'failure' = 'success') {
    this.ifName = normalizeIfName(ifName);
    this.statusValue = status;
  }

  private prefixMessage(value: string | null): string {
    const texto = sanitizeText(value) ?? 'erro não especificado';
    return texto;
  }

  private createEntry(value: Partial<SimulacaoEntry> | string): SimulacaoEntry {
    if (typeof value === 'string') {
      return {
        ...baseEntry(),
        tipo_amortizacao: this.prefixMessage(value),
      };
    }

    const entry = baseEntry();
    const source = value as Record<string, any>;

    (Object.keys(FIELD_MAP) as Array<keyof SimulacaoEntry>).forEach((targetKey) => {
      for (const alias of FIELD_MAP[targetKey]) {
        if (Object.prototype.hasOwnProperty.call(source, alias)) {
          const raw = source[alias];
          if (raw === undefined || raw === null) break;

          if (targetKey === 'prazo') {
            entry.prazo = cleanPrazo(raw) ?? sanitizeText(raw);
          } else if (monetaryFields.has(targetKey)) {
            entry[targetKey] = cleanMonetaryValue(raw) ?? sanitizeText(raw);
          } else {
            entry[targetKey] = sanitizeText(raw);
          }
          break;
        }
      }
    });

    return entry;
  }

  addEntry(value: Partial<SimulacaoEntry> | string): SimulationPayload {
    this.entries.push(this.createEntry(value));
    return this;
  }

  addEntries(values: Array<Partial<SimulacaoEntry> | string>): SimulationPayload {
    values.forEach((value) => this.addEntry(value));
    return this;
  }

  addFailure(message: string): SimulationPayload {
    this.statusValue = 'failure';
    this.entries.push(this.createEntry(message));
    return this;
  }

  mergeRawResults(raw: any): SimulationPayload {
    if (Array.isArray(raw)) {
      raw.forEach((item) => this.addEntry(item));
      return this;
    }

    if (raw && typeof raw === 'object') {
      if (Array.isArray(raw.result)) {
        raw.result.forEach((item: any) => this.addEntry(item));
      }
    }

    return this;
  }

  setStatus(status: 'success' | 'failure'): SimulationPayload {
    this.statusValue = status;
    return this;
  }

  hasEntries(): boolean {
    return this.entries.length > 0;
  }

  entryCount(): number {
    return this.entries.length;
  }

  static normalizeIf(value: any): string {
    return normalizeIfName(value);
  }

  static normalizeStatus(value: any): 'success' | 'failure' {
    return normalizeStatus(value);
  }

  static ensureEntry(value: Partial<SimulacaoEntry> | string, ifName = 'unknown'): SimulacaoEntry {
    const payload = new SimulationPayload(ifName);
    return payload.createEntry(value);
  }

  toJSON(): { if: string; status: 'success' | 'failure'; result: SimulacaoEntry[] } {
    const result = this.entries.map((entry) => ({ ...baseEntry(), ...entry }));
    return {
      if: this.ifName,
      status: this.statusValue,
      result,
    };
  }
}

export const SimulationUtils = {
  normalizeIf: normalizeIfName,
  normalizeStatus,
  ensureEntry: (value: Partial<SimulacaoEntry> | string) => SimulationPayload.ensureEntry(value),
};

export const buildSimulationPayload = (raw: any, fallbackIf: string): SimulationPayload => {
  const ifName = normalizeIfName(raw?.if ?? raw?.target ?? fallbackIf);
  const status = normalizeStatus(raw?.status ?? raw?.data?.status);
  const payload = new SimulationPayload(ifName, status);

  payload.mergeRawResults(raw?.result);
  if (raw?.data) {
    payload.mergeRawResults(raw.data.result);
  }

  if (status === 'failure') {
    const failureMessage = sanitizeText(raw?.message ?? raw?.data?.message);
    if (failureMessage) {
      payload.addFailure(failureMessage);
    }
  }

  return payload;
};
