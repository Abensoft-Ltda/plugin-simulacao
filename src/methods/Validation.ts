import { unidecode } from "unidecode"; // npm install unidecode

export interface CaixaInput {
    tipo_imovel?: string;
    opcao_financiamento?: string;
    valor_imovel?: string | number;
    valor_reforma?: string | number;
    portabilidade?: string;
    uf?: string;
    renda_familiar?: string | number;
    data_nasc?: string;
    multiplos_compradores?: string;
    telefone_celular?: string | number;
    beneficiado_fgts?: boolean | string;
    data_beneficio?: string;
    cpf?: string | number;
    cidade?: string;
    possui_imovel?: string;
    status_lote?: string;
}

export interface CaixaFieldsResult {
    fields: Record<string, any>;
    errors: string[];
}

export class CaixaFields {
    static buildCaixaFields(targetData: CaixaInput): CaixaFieldsResult {
        const errors: string[] = [];
        const requiredFields = [
            "tipo_imovel",
            "valor_imovel",
            "uf",
            "renda_familiar",
            "data_nasc",
            "beneficiado_fgts",
            "cidade",
        ];

        for (const f of requiredFields) {
            if (!(f in targetData)) {
                errors.push(`Parâmetro obrigatório para o target 'caixa' ausente: ${f}`);
            }
        }
        if (errors.length > 0) {
            return { fields: {}, errors };
        }

        // --- Build initial fields map ---
        const fields: Record<string, any> = {
            tipo_imovel: targetData.tipo_imovel,
            opcao_financiamento: targetData.opcao_financiamento,
            valor_imovel: targetData.valor_imovel,
            valor_reforma: targetData.valor_reforma,
            possui_financiamento_habitacional: targetData.portabilidade,
            uf: targetData.uf,
            renda_familiar: targetData.renda_familiar,
            data_nascimento: targetData.data_nasc,
            multiplos_compradores: targetData.multiplos_compradores,
            telefone_celular: targetData.telefone_celular,
            beneficiado_fgts: targetData.beneficiado_fgts,
            data_beneficio: targetData.data_beneficio,
            cpf: targetData.cpf,
            cidade: targetData.cidade ? unidecode(targetData.cidade) : undefined,
            possui_imovel: targetData.possui_imovel,
            portabilidade_credito: targetData.portabilidade,
            lote_alienado_hipotecado: targetData.status_lote,
        };

        // --- Normalize strings ---
        for (const key of Object.keys(fields)) {
            if (typeof fields[key] === "string") {
                fields[key] = (fields[key] as string).toLowerCase();
            }
        }

        fields["beneficiado_fgts"] =
            fields["beneficiado_fgts"] === true || fields["beneficiado_fgts"] === "true"
                ? "sim"
                : "nao";

        try {
            if (fields["tipo_imovel"]) {
                fields["tipo_imovel"] = unidecode(fields["tipo_imovel"]);
                fields["tipo_imovel"] = fields["tipo_imovel"].replace(/[^a-zA-Z\s]/g, "").toLowerCase();
            }
            fields["renda_familiar"] = String(parseFloat(fields["renda_familiar"]));
            if (fields["valor_reforma"]) {
                fields["valor_reforma"] = String(parseFloat(fields["valor_reforma"]));
            }
            if (fields["telefone_celular"]) {
                fields["telefone_celular"] = String(fields["telefone_celular"]).replace(/\D/g, "");
            }
            if (fields["cpf"]) {
                fields["cpf"] = String(fields["cpf"]).replace(/\D/g, "");
            }
        } catch {
            errors.push("Campos numéricos (renda, valor_reforma) contêm valores inválidos.");
        }

        // --- Validation Logic ---
        const validImovelTypes: Record<string, string> = {
            "aquisicao de imovel na planta": "residencial",
            "aquisicao de imovel novo": "residencial",
            "aquisicao de imovel usado": "residencial",
            "aquisicao de terreno": "residencial",
            "aquisicao de terreno e construcao": "residencial",
            "construcao em terreno proprio": "residencial",
            "aquisicao de sala comercial": "comercial",
            "aquisicao de terreno comercial": "comercial",
        };

        if (fields["tipo_imovel"] in validImovelTypes) {
            fields["categoria_imovel"] = validImovelTypes[fields["tipo_imovel"]];
        } else {
            errors.push("Tipo de imóvel inválido.");
        }

        if (fields["cpf"]) {
            if (
                !fields["cpf"] ||
                !fields["telefone_celular"] ||
                !/^\d+$/.test(fields["cpf"]) ||
                !/^\d+$/.test(fields["telefone_celular"])
            ) {
                errors.push("CPF e Telefone Celular devem ser fornecidos e conter apenas números.");
            }
        }

        if (fields["tipo_imovel"].includes("reforma")) {
            if (!fields["valor_reforma"] || !fields["possui_financiamento_habitacional"]) {
                errors.push(
                    "'valor_reforma' e 'possui_financiamento_habitacional' são necessários para a opção de financiamento de reforma."
                );
            }
            if (fields["categoria_imovel"] && fields["categoria_imovel"] !== "residencial") {
                errors.push("A opção de reforma apenas está disponível para imóveis residenciais.");
            }
        }

        if (
            String(fields["portabilidade_credito"]).includes("sim") &&
            !fields["tipo_imovel"].includes("usado") &&
            !fields["tipo_imovel"].includes("emprestimo")
        ) {
            errors.push(
                "Para portabilidade, as opções permitidas são 'Aquisição de imóvel usado' or 'Empréstimo Garantido por Imóvel'."
            );
        }

        if (fields["tipo_imovel"].includes("construcao")) {
            if (fields["lote_alienado_hipotecado"] === undefined) {
                errors.push(
                    "A chave 'lote_alienado_hipotecado' é obrigatória para a opção de financiamento de construção."
                );
            }
            if (fields["categoria_imovel"] && fields["categoria_imovel"] !== "residencial") {
                errors.push("A opção de construção apenas está disponível para imóveis residenciais.");
            }
        }

        return { fields, errors };
    }
}
