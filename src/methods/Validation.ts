import { fakerBr } from '@js-brasil/fakerbr';

function unidecode(str: string): string {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export interface SimulationInput {
    beneficiado_fgts?: boolean | string;
    cidade?: string;
    data_nasc?: string;
    leal_if_id?: string | number;
    multiplos_compradores?: boolean | string;
    nome?: string;
    prazo_financiamento?: string | number;
    renda_familiar?: string | number;
    simulacao_id?: string | number;
    status?: string | number;
    target?: string;
    tipo_imovel?: string;
    uf?: string;
    valor_entrada?: string | number;
    valor_fgts?: boolean | string;
    valor_imovel?: string | number;
    opcao_financiamento?: string;
    valor_reforma?: string | number;
    portabilidade?: string;
    telefone_celular?: string | number;
    data_beneficio?: string;
    cpf?: string | number;
    possui_imovel?: string;
    status_lote?: string;
    fgts_valor_imovel?: string | number;
    id?: string;
    leal_cad_atendimento_id?: string;
    leal_cidade_id?: string;
    leal_uf_id?: string;
    leal_usr_cliente_id?: string;
}

export interface CaixaFieldsResult {
    fields: Record<string, any>;
    errors: string[];
}

export interface BBFieldsResult {
    fields: Record<string, any>;
    errors: string[];
}

export class CaixaFields {
    static buildCaixaFields(rawTargetData: Record<string, any>): CaixaFieldsResult {
        const errors: string[] = [];

        const targetData: SimulationInput = {};
        
        const directFieldMap: { [key: string]: keyof SimulationInput } = {
            'beneficiado_fgts': 'beneficiado_fgts',
            'cidade': 'cidade',
            'data_nasc': 'data_nasc',
            'multiplos_compradores': 'multiplos_compradores',
            'prazo_financiamento': 'prazo_financiamento',
            'renda_familiar': 'renda_familiar',
            'target': 'target',
            'tipo_imovel': 'tipo_imovel',
            'uf': 'uf',
            'valor_entrada': 'valor_entrada',
            'valor_imovel': 'valor_imovel',
            'valor_fgts': 'fgts_valor_imovel',
            'leal_if_id': 'leal_if_id',
            'simulacao_id': 'id',
            'status': 'status',
            'cpf': 'cpf',
        };

        // Map direct fields
        for (const [sourceKey, targetKey] of Object.entries(directFieldMap)) {
            if (rawTargetData.hasOwnProperty(sourceKey)) {
                targetData[targetKey] = rawTargetData[sourceKey];
            }
        }

        // Additional mappings for fields that don't follow the standard pattern
        if (!targetData.uf && rawTargetData.uf) {
            targetData.uf = rawTargetData.uf;
        }
        if (!targetData.cidade && rawTargetData.cidade) {
            targetData.cidade = rawTargetData.cidade;
        }
        if (!targetData.data_nasc && rawTargetData.data_nascimento) {
            targetData.data_nasc = rawTargetData.data_nascimento;
        }

        const requiredFields = [
            "tipo_imovel",
            "valor_imovel",
            "uf",
            "renda_familiar",
            "data_nasc",
            "cidade",
        ];

        for (const f of requiredFields) {
            if (!targetData.hasOwnProperty(f)) {
                errors.push(`Parâmetro obrigatório ausente: ${f}`);
            }
        }

        if (errors.length > 0) {
            return { fields: {}, errors };
        }

        const fields: Record<string, any> = {
            target: rawTargetData['simulacao-target'] || 'caixa',
            fgts_valor_imovel: targetData.fgts_valor_imovel,
            id: targetData.id,
            leal_cad_atendimento_id: targetData.leal_cad_atendimento_id,
            leal_cidade_id: targetData.leal_cidade_id,
            leal_if_id: targetData.leal_if_id,
            leal_uf_id: targetData.leal_uf_id,
            leal_usr_cliente_id: targetData.leal_usr_cliente_id,
            prazo_financiamento: targetData.prazo_financiamento,
            status: targetData.status,
            valor_entrada: targetData.valor_entrada,
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

        for (const key of Object.keys(fields)) {
            if (typeof fields[key] === "string" && !key.includes("data_")) {
                fields[key] = (fields[key] as string).toLowerCase();
            }
        }

        fields["beneficiado_fgts"] = (fields["beneficiado_fgts"] === true || String(fields["beneficiado_fgts"]) === "true" || String(fields["beneficiado_fgts"]) === "sim" || String(fields["beneficiado_fgts"]) === "on")
            ? "sim"
            : "nao";
        
        try {
            if (fields["data_nascimento"] && typeof fields["data_nascimento"] === 'string') {
                 const [day, month, year] = fields["data_nascimento"].split('/');
                 if(!(day && month && year && day.length === 2 && month.length === 2 && year.length === 4)) {
                     const date = new Date(fields["data_nascimento"]);
                     if (!isNaN(date.getTime())) {
                        fields["data_nascimento"] = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
                     }
                 }
            }
            if (fields["tipo_imovel"]) {
                fields["tipo_imovel"] = unidecode(fields["tipo_imovel"]);
                fields["tipo_imovel"] = fields["tipo_imovel"].replace(/[^a-zA-Z\s'\u2019]/g, "").toLowerCase();
            }
            if (fields["valor_imovel"]) {
                fields["valor_imovel"] = String(parseFloat(String(fields["valor_imovel"])) * 100);
            }
            fields["renda_familiar"] = String(parseFloat(String(fields["renda_familiar"])) * 100);
            if (fields["valor_reforma"]) {
                fields["valor_reforma"] = String(parseFloat(String(fields["valor_reforma"])) * 100);
            }
            // CPF/telefone generation intentionally removed here; handled elsewhere if needed.
        } catch {
            errors.push("Campos numéricos (renda, valor_reforma) contêm valores inválidos.");
        }

        const valid_imovel_types: Record<string, string> = {
            "aquisicao de imovel na planta": "residencial", "aquisicao de imovel novo": "residencial",
            "aquisicao de imovel usado": "residencial", "aquisicao de terreno": "residencial",
            "aquisicao de terreno e construcao": "residencial", "construcao em terreno proprio": "residencial",
            "aquisicao de sala comercial": "comercial", "aquisicao de terreno comercial": "comercial"
        };

        const capitalizationMap: Record<string, string> = {
            "aquisicao de imovel na planta": "Aquisição de Imóvel na Planta",
            "aquisicao de imovel novo": "Aquisição de Imóvel Novo",
            "aquisicao de imovel usado": "Aquisição de Imóvel Usado",
            "aquisicao de terreno": "Aquisição de Terreno",
            "aquisicao de terreno e construcao": "Aquisição de Terreno e Construção",
            "construcao em terreno proprio": "Construção em Terreno Próprio",
            "aquisicao de sala comercial": "Aquisição de Sala Comercial",
            "aquisicao de terreno comercial": "Aquisição de Terreno Comercial"
        };

        if (fields["tipo_imovel"] in valid_imovel_types) {
            const normalizedCategory = fields["tipo_imovel"];
            fields["categoria_imovel"] = capitalizationMap[normalizedCategory] || normalizedCategory;
            fields["tipo_imovel"] = valid_imovel_types[normalizedCategory];
        } else {
            errors.push(`Tipo de imóvel inválido: ${fields["tipo_imovel"]}`);
        }


        if (String(fields["tipo_imovel"]).includes("reforma")) {
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
            !String(fields["tipo_imovel"]).includes("usado") &&
            !String(fields["tipo_imovel"]).includes("emprestimo")
        ) {
            errors.push(
                "Para portabilidade, as opções permitidas são 'Aquisição de imóvel usado' or 'Empréstimo Garantido por Imóvel'."
            );
        }

        if (String(fields["tipo_imovel"]).includes("construcao")) {
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

export class BBFields {
    static buildBBFields(rawTargetData: Record<string, any>): BBFieldsResult {
        const errors: string[] = [];

        const targetData: SimulationInput = {};
        
        const directFieldMap: { [key: string]: keyof SimulationInput } = {
            'beneficiado_fgts': 'beneficiado_fgts',
            'cidade': 'cidade',
            'data_nasc': 'data_nasc',
            'multiplos_compradores': 'multiplos_compradores',
            'prazo_financiamento': 'prazo_financiamento',
            'renda_familiar': 'renda_familiar',
            'target': 'target',
            'tipo_imovel': 'tipo_imovel',
            'uf': 'uf',
            'valor_entrada': 'valor_entrada',
            'valor_imovel': 'valor_imovel',
            'valor_fgts': 'fgts_valor_imovel',
            'leal_if_id': 'leal_if_id',
            'simulacao_id': 'id',
            'status': 'status',
            'cpf': 'cpf',
        };

        // Map direct fields
        for (const [sourceKey, targetKey] of Object.entries(directFieldMap)) {
            if (rawTargetData.hasOwnProperty(sourceKey)) {
                targetData[targetKey] = rawTargetData[sourceKey];
            }
        }


        if (!targetData.uf && rawTargetData.uf) {
            targetData.uf = rawTargetData.uf;
        }
        if (!targetData.cidade && rawTargetData.cidade) {
            targetData.cidade = rawTargetData.cidade;
        }
        if (!targetData.data_nasc && rawTargetData.data_nascimento) {
            targetData.data_nasc = rawTargetData.data_nascimento;
        }

        const requiredFields = [
            "tipo_imovel",
            "valor_imovel",
            "uf",
            "renda_familiar",
            "data_nasc",
            "cidade",
        ];

        for (const f of requiredFields) {
            if (!targetData.hasOwnProperty(f)) {
                errors.push(`Parâmetro obrigatório ausente: ${f}`);
            }
        }

        if (errors.length > 0) {
            return { fields: {}, errors };
        }

        const fields: Record<string, any> = {
            target: rawTargetData['simulacao-target'] || 'bb',
            fgts_valor_imovel: targetData.fgts_valor_imovel,
            id: targetData.id,
            leal_cad_atendimento_id: targetData.leal_cad_atendimento_id,
            leal_cidade_id: targetData.leal_cidade_id,
            leal_if_id: targetData.leal_if_id,
            leal_uf_id: targetData.leal_uf_id,
            leal_usr_cliente_id: targetData.leal_usr_cliente_id,
            prazo_financiamento: targetData.prazo_financiamento,
            status: targetData.status,
            valor_entrada: targetData.valor_entrada,
            tipo_imovel: targetData.tipo_imovel,
            valor_imovel: targetData.valor_imovel,
            valor_reforma: targetData.valor_reforma,
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
        };

        // Apply string normalization
        for (const key of Object.keys(fields)) {
            if (typeof fields[key] === "string" && !key.includes("data_")) {
                fields[key] = (fields[key] as string).toLowerCase();
            }
        }

        // BB specific field processing
        fields["beneficiado_fgts"] = (fields["beneficiado_fgts"] === true || String(fields["beneficiado_fgts"]) === "true" || String(fields["beneficiado_fgts"]) === "sim" || String(fields["beneficiado_fgts"]) === "on")
            ? "sim"
            : "nao";

        try {
            // Date formatting
            if (fields["data_nascimento"] && typeof fields["data_nascimento"] === 'string') {
                 const [day, month, year] = fields["data_nascimento"].split('/');
                 if(!(day && month && year && day.length === 2 && month.length === 2 && year.length === 4)) {
                     const date = new Date(fields["data_nascimento"]);
                     if (!isNaN(date.getTime())) {
                        fields["data_nascimento"] = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
                     }
                 }
            }

            // Property type normalization
            if (fields["tipo_imovel"]) {
                fields["tipo_imovel"] = unidecode(fields["tipo_imovel"]);
                fields["tipo_imovel"] = fields["tipo_imovel"].replace(/[^a-zA-Z\s'\u2019]/g, "").toLowerCase();
            }

            if (fields["valor_imovel"]) {
                fields["valor_imovel"] = String(parseFloat(String(fields["valor_imovel"])) * 100);
            }
            fields["renda_familiar"] = String(parseFloat(String(fields["renda_familiar"])) * 100);
            if (fields["valor_reforma"]) {
                fields["valor_reforma"] = String(parseFloat(String(fields["valor_reforma"])) * 100);
            }

            const sanitizeDigits = (input: string | number | undefined | null) => {
                if (input === undefined || input === null) return "";
                return String(input).replace(/\D/g, "");
            };

            const providedCpf = sanitizeDigits(targetData.cpf);
            fields["cpf"] = providedCpf.length === 11
                ? providedCpf
                : sanitizeDigits(fakerBr.cpf());

            const providedPhone = sanitizeDigits(targetData.telefone_celular);
            fields["telefone_celular"] = providedPhone || sanitizeDigits(fakerBr.celular());
        } catch {
            errors.push("Campos numéricos (renda, valor_reforma) contêm valores inválidos.");
        }

        const valid_imovel_types: Record<string, string> = {
            "aquisicao de imovel na planta": "residencial", 
            "aquisicao de imovel novo": "residencial",
            "aquisicao de imovel usado": "residencial", 
            "aquisicao de terreno": "residencial",
            "aquisicao de terreno e construcao": "residencial", 
            "construcao em terreno proprio": "residencial",
            "aquisicao de sala comercial": "comercial", 
            "aquisicao de terreno comercial": "comercial"
        };

        const capitalizationMap: Record<string, string> = {
            "aquisicao de imovel na planta": "Aquisição de Imóvel na Planta",
            "aquisicao de imovel novo": "Aquisição de Imóvel Novo",
            "aquisicao de imovel usado": "Aquisição de Imóvel Usado",
            "aquisicao de terreno": "Aquisição de Terreno",
            "aquisicao de terreno e construcao": "Aquisição de Terreno e Construção",
            "construcao em terreno proprio": "Construção em Terreno Próprio",
            "aquisicao de sala comercial": "Aquisição de Sala Comercial",
            "aquisicao de terreno comercial": "Aquisição de Terreno Comercial"
        };

        if (fields["tipo_imovel"] in valid_imovel_types) {
            const normalizedCategory = fields["tipo_imovel"];
            fields["categoria_imovel"] = capitalizationMap[normalizedCategory] || normalizedCategory;
            fields["tipo_imovel"] = valid_imovel_types[normalizedCategory];
        } else {
            errors.push(`Tipo de imóvel inválido: ${fields["tipo_imovel"]}`);
        }


        return { fields, errors };
    }
}
