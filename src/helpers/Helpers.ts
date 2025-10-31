export class Helpers {
  static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  static normalizeText(text: string | null | undefined): string {
    if (!text) return '';
    return text
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  static maskCPF(cpf: string): string {
    const digits = cpf.replace(/\D/g, '');
    if (digits.length !== 11) return cpf;
    return digits.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
  }

  static formatCurrencyFromCents(value: string): string {
    const numeric = Number(value) / 100;
    if (!Number.isFinite(numeric)) return value;
    return numeric.toLocaleString('pt-BR', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
  }

  static capitalizeWords(str: string): string {
    if (!str) return '';
    return str
      .split(' ')
      .filter(Boolean)
      .map(word => {
        if (!word) return '';
        const [first, ...rest] = [...word];
        const initial = first ? first.toLocaleUpperCase('pt-BR') : '';
        return `${initial}${rest.join('')}`;
      })
      .join(' ');
  }

  static parseMonetaryCandidate(candidate: unknown): number | null {
    if (candidate === undefined || candidate === null || candidate === '') return null;

    if (typeof candidate === 'number') {
      if (!Number.isFinite(candidate)) return null;
      return candidate;
    }

    const raw = String(candidate).trim();
    if (!raw) return null;

    const trimmed = raw.replace(/[R$\s]/gi, '');
    if (!trimmed) return null;

    if (trimmed.includes('.') && trimmed.includes(',')) {
      const normalized = trimmed.replace(/\./g, '').replace(',', '.');
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) return parsed;
    }

    if (trimmed.includes('.') && !trimmed.includes(',')) {
      const decimalMatch = trimmed.match(/\.\d{1,2}$/);
      if (decimalMatch) {
        const parsed = Number(trimmed);
        if (!Number.isNaN(parsed)) return parsed;
      }
      const withoutDots = trimmed.replace(/\./g, '');
      const parsed = Number(withoutDots);
      if (!Number.isNaN(parsed)) return parsed;
    }

    if (!trimmed.includes('.') && trimmed.includes(',')) {
      const normalized = trimmed.replace(',', '.');
      const parsed = Number(normalized);
      if (!Number.isNaN(parsed)) return parsed;
    }

    const digitsOnly = trimmed.replace(/\D/g, '');
    if (!digitsOnly) return null;
    const parsedDigits = Number(digitsOnly);
    if (Number.isNaN(parsedDigits)) return null;
    return parsedDigits;
  }
}
