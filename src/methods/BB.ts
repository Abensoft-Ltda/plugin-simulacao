import { BBFields } from "./Validation";
import type { SimulationInput, BBFieldsResult } from "./Validation";

export class BB {
  private rawData: SimulationInput;
  private fields: Record<string, any> = {};
  private errors: string[] = [];

  constructor(data: SimulationInput) {
    this.rawData = data;
    const { fields, errors }: BBFieldsResult = BBFields.buildBBFields(data);
    this.fields = fields;
    this.errors = errors;
  }

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
