import { CaixaFields } from "./Validation";
import type { CaixaInput, CaixaFieldsResult } from "./Validation";

export class Caixa {
    private rawData: CaixaInput;
    private fields: Record<string, any> = {};
    private errors: string[] = [];

    constructor(data: CaixaInput) {
        this.rawData = data;
        const { fields, errors }: CaixaFieldsResult = CaixaFields.buildCaixaFields(data);
        this.fields = fields;
        this.errors = errors;
    }

    /** Returns whether the data passed validation */
    isValid(): boolean {
        return this.errors.length === 0;
    }

    getFields(): Record<string, any> {
        return this.fields;
    }

    getErrors(): string[] {
        return this.errors;
    }

    toJSON(): object {
        return {
            valid: this.isValid(),
            fields: this.fields,
            errors: this.errors,
        };
    }
}
