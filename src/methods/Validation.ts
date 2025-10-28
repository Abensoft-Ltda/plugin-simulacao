import { fakerBr } from '@js-brasil/fakerbr';
import { BaseFieldsBuilder, type FieldsResult, type SimulationInput } from './BaseFieldsBuilder';

// --- Subclasses especializadas ---

export class CaixaFields extends BaseFieldsBuilder {
    protected getDefaultTarget(): string {
        return 'caixa';
    }

    /**
     * Adiciona campos específicos da Caixa aos campos base.
     */
    protected buildFields(): void {
        super.buildFields(); // Build all common fields first
        
        // Add fields specific to Caixa
        this.fields.portabilidade_credito = this.targetData.portabilidade;
        this.fields.lote_alienado_hipotecado = this.targetData.status_lote;
    }

    /**
     * Executa regras de validação específicas da Caixa.
     */
    protected runSpecificValidations(): void {
        if (String(this.fields["tipo_imovel"]).includes("reforma")) {
            if (!this.fields["valor_reforma"] || !this.fields["possui_financiamento_habitacional"]) {
                this.errors.push(
                    "'valor_reforma' e 'possui_financiamento_habitacional' são necessários para a opção de financiamento de reforma."
                );
            }
            if (this.fields["categoria"] && this.fields["categoria"] !== "residencial") {
                this.errors.push("A opção de reforma apenas está disponível para imóveis residenciais.");
            }
        }

        if (
            String(this.fields["portabilidade_credito"]).includes("sim") &&
            !String(this.fields["tipo_imovel"]).includes("usado") &&
            !String(this.fields["tipo_imovel"]).includes("emprestimo")
        ) {
            this.errors.push(
                "Para portabilidade, as opções permitidas são 'Aquisição de imóvel usado' or 'Empréstimo Garantido por Imóvel'."
            );
        }

        if (String(this.fields["tipo_imovel"]).includes("construcao")) {
            if (this.fields["lote_alienado_hipotecado"] === undefined) {
                this.errors.push(
                    "A chave 'lote_alienado_hipotecado' é obrigatória para a opção de financiamento de construção."
                );
            }
            if (this.fields["categoria"] && this.fields["categoria"] !== "residencial") {
                this.errors.push("A opção de construção apenas está disponível para imóveis residenciais.");
            }
        }
    }

    /**
     * Ponto de entrada estático para manter a API original.
     */
    static buildCaixaFields(rawTargetData: Record<string, any>): FieldsResult {
        return new CaixaFields(rawTargetData).build();
    }
}


export class BBFields extends BaseFieldsBuilder {
    protected getDefaultTarget(): string {
        return 'bb';
    }

    /**
     * BB não possui campos específicos além dos base.
     */
    protected buildFields(): void {
        super.buildFields();
    }
    
    /**
     * Aplica transformações específicas do BB, como gerar CPF/tel falsos quando necessário.
     */
    protected applySpecificTransformations(): void {
        const sanitizeDigits = (input: string | number | undefined | null): string => {
            if (input === undefined || input === null) return "";
            return String(input).replace(/\D/g, "");
        };

        const providedCpf = sanitizeDigits(this.targetData.cpf);
        this.fields["cpf"] = providedCpf.length === 11
            ? providedCpf
            : sanitizeDigits(fakerBr.cpf());

        const providedPhone = sanitizeDigits(this.targetData.telefone_celular);
        this.fields["telefone_celular"] = providedPhone || sanitizeDigits(fakerBr.celular());
    }

    /**
     * BB não possui regras de validação específicas.
     */
    protected runSpecificValidations(): void {
        // No specific validations for BB
    }

    /**
     * Ponto de entrada estático para manter a API original.
     */
    static buildBBFields(rawTargetData: Record<string, any>): FieldsResult {
        return new BBFields(rawTargetData).build();
    }
}