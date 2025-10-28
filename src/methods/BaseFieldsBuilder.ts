//  Utilitários e Interfaces Reutilizáveis 

function unidecode(str: string): string {
    if (!str) return "";
    return str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

// Tipo de resultado único, já que ambos eram idênticos
export interface FieldsResult {
    fields: Record<string, any>;
    errors: string[];
}

// Interface de entrada
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
    categoria?: string;
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

//  Constantes Compartilhadas 

const DIRECT_FIELD_MAP: { [key: string]: keyof SimulationInput } = {
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
    'categoria': 'categoria',
};

const REQUIRED_FIELDS = [
    "tipo_imovel",
    "categoria",
    "valor_imovel",
    "uf",
    "renda_familiar",
    "data_nasc",
    "cidade",
];

// REMOVIDO: O mapa 'VALID_IMOVEL_TYPES' estava incorreto e foi removido.

// Este é o único mapa de autoridade: normalizado -> capitalizado
const CAPITALIZATION_MAP: Record<string, string> = {
    "aquisicao de imovel na planta": "Aquisição de Imóvel na Planta",
    "aquisicao de imovel novo": "Aquisição de Imóvel Novo",
    "aquisicao de imovel usado": "Aquisição de Imóvel Usado",
    "imoveis caixa": "Imóveis Caixa",
    "aquisicao de terreno": "Aquisição de Terreno",
    "aquisicao de terreno e construcao": "Aquisição de Terreno e Construção",
    "construcao em terreno proprio": "Construção em Terreno Próprio",
    "aquisicao de sala comercial": "Aquisição de Sala Comercial",
    "aquisicao de terreno comercial": "Aquisição de Terreno Comercial"
};


//  Classe Base com Lógica Comum 

export abstract class BaseFieldsBuilder {
    protected rawTargetData: Record<string, any>;
    protected targetData: SimulationInput = {};
    protected fields: Record<string, any> = {};
    protected errors: string[] = [];

    constructor(rawTargetData: Record<string, any>) {
        this.rawTargetData = rawTargetData;
    }

    /**
     * Orquestra o processo de build usando o padrão Template Method.
     */
    public build(): FieldsResult {
        this.mapRawToTargetData();
        this.validateRequiredFields();

        if (this.errors.length > 0) {
            return { fields: {}, errors: this.errors };
        }

        this.buildFields();
        this.normalizeStrings();
        this.normalizeBooleans();
        this.applyTransformations(); // Includes try...catch
        this.validateAndSetPropertyType();
        this.runSpecificValidations();

        if (this.errors.length > 0) {
            return { fields: {}, errors: this.errors };
        }

        return { fields: this.fields, errors: this.errors };
    }

    /**
     * Fornece o target padrão (ex.: 'caixa', 'bb').
     */
    protected abstract getDefaultTarget(): string;

    /**
     * Ponto de extensão para subclasses adicionarem regras de validação específicas.
     */
    protected abstract runSpecificValidations(): void;

    /**
     * Preenche `targetData` a partir de `rawTargetData`.
     */
    protected mapRawToTargetData(): void {
        for (const [sourceKey, targetKey] of Object.entries(DIRECT_FIELD_MAP)) {
            if (this.rawTargetData.hasOwnProperty(sourceKey)) {
                this.targetData[targetKey] = this.rawTargetData[sourceKey];
            }
        }

        if (!this.targetData.uf && this.rawTargetData.uf) {
            this.targetData.uf = this.rawTargetData.uf;
        }
        if (!this.targetData.cidade && this.rawTargetData.cidade) {
            this.targetData.cidade = this.rawTargetData.cidade;
        }
        if (!this.targetData.data_nasc && this.rawTargetData.data_nascimento) {
            this.targetData.data_nasc = this.rawTargetData.data_nascimento;
        }
    }

    /**
     * Valida se todos os campos obrigatórios estão presentes em `targetData`.
     */
    protected validateRequiredFields(): void {
        for (const f of REQUIRED_FIELDS) {
            if (!this.targetData.hasOwnProperty(f as keyof SimulationInput)) {
                this.errors.push(`Parâmetro obrigatório ausente: ${f}`);
            }
        }
    }

    /**
     * Constrói o objeto base `fields` a partir de `targetData`.
     * Subclasses podem sobrescrever este método para adicionar/alterar campos.
     */
    protected buildFields(): void {
        this.fields = {
            target: this.rawTargetData['simulacao-target'] || this.getDefaultTarget(),
            fgts_valor_imovel: this.targetData.fgts_valor_imovel,
            id: this.targetData.id,
            leal_cad_atendimento_id: this.targetData.leal_cad_atendimento_id,
            leal_cidade_id: this.targetData.leal_cidade_id,
            leal_if_id: this.targetData.leal_if_id,
            leal_uf_id: this.targetData.leal_uf_id,
            leal_usr_cliente_id: this.targetData.leal_usr_cliente_id,
            prazo_financiamento: this.targetData.prazo_financiamento,
            status: this.targetData.status,
            valor_entrada: this.targetData.valor_entrada,
            tipo_imovel: this.targetData.tipo_imovel,
            categoria: this.targetData.categoria, 
            opcao_financiamento: this.targetData.opcao_financiamento,
            valor_imovel: this.targetData.valor_imovel,
            valor_reforma: this.targetData.valor_reforma,
            possui_financiamento_habitacional: this.targetData.portabilidade, // Used by Caixa
            uf: this.targetData.uf,
            renda_familiar: this.targetData.renda_familiar,
            data_nascimento: this.targetData.data_nasc,
            multiplos_compradores: this.targetData.multiplos_compradores,
            telefone_celular: this.targetData.telefone_celular,
            beneficiado_fgts: this.targetData.beneficiado_fgts,
            data_beneficio: this.targetData.data_beneficio,
            cpf: this.targetData.cpf,
            cidade: this.targetData.cidade ? unidecode(this.targetData.cidade) : undefined,
            possui_imovel: this.targetData.possui_imovel,
        };
    }

    /**
     * Normaliza todos os campos string para minúsculas, exceto campos de data.
     */
    protected normalizeStrings(): void {
        for (const key of Object.keys(this.fields)) {
            if (typeof this.fields[key] === "string" && !key.includes("data_")) {
                this.fields[key] = (this.fields[key] as string).toLowerCase();
            }
        }
    }

    /**
     * Normaliza campos com valor booleano para "sim" ou "nao".
     */
    protected normalizeBooleans(): void {
        const val = this.fields["beneficiado_fgts"];
        this.fields["beneficiado_fgts"] = (val === true || String(val) === "true" || String(val) === "sim" || String(val) === "on")
            ? "sim"
            : "nao";
    }

    /**
     * Envolve transformações de dados em um bloco try...catch.
     */
    protected applyTransformations(): void {
        try {
            this.formatDates();
            this.normalizePropertyTypes();
            this.formatCurrency();
            this.applySpecificTransformations(); // Hook for subclasses (like BB)
        } catch {
            this.errors.push("Campos numéricos (renda, valor_reforma) contêm valores inválidos.");
        }
    }

    /**
     * Formata strings de data para o formato DD/MM/YYYY.
     */
    protected formatDates(): void {
        if (this.fields["data_nascimento"] && typeof this.fields["data_nascimento"] === 'string') {
            const [day, month, year] = this.fields["data_nascimento"].split('/');
            if (!(day && month && year && day.length === 2 && month.length === 2 && year.length === 4)) {
                const date = new Date(this.fields["data_nascimento"]);
                if (!isNaN(date.getTime())) {
                    this.fields["data_nascimento"] = `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
                }
            }
        }
    }

    /**
     * Normaliza a string `tipo_imovel`.
     */
    protected normalizePropertyTypes(): void {
        if (this.fields["tipo_imovel"]) {
            this.fields["tipo_imovel"] = unidecode(this.fields["tipo_imovel"]);
            this.fields["tipo_imovel"] = this.fields["tipo_imovel"].replace(/[^a-zA-Z\s'\u2019]/g, "").toLowerCase();
        }
    }

    /**
     * Converte campos monetários para centavos (como strings).
     */
    protected formatCurrency(): void {
        if (this.fields["valor_imovel"]) {
            this.fields["valor_imovel"] = String(parseFloat(String(this.fields["valor_imovel"])) * 100);
        }
        this.fields["renda_familiar"] = String(parseFloat(String(this.fields["renda_familiar"])) * 100);
        if (this.fields["valor_reforma"]) {
            this.fields["valor_reforma"] = String(parseFloat(String(this.fields["valor_reforma"])) * 100);
        }
    }

    /**
     * Ponto de extensão para transformações específicas de subclasses (ex.: faker).
     */
    protected applySpecificTransformations(): void {
        // Base implementation does nothing.
    }

    /**
     * Valida `tipo_imovel` e `categoria` contra os mapas de autoridade.
     * Converte `tipo_imovel` para a string capitalizada final.
     */
    protected validateAndSetPropertyType(): void {
        // 'tipo_imovel' já foi normalizado (lowercase, unidecode)
        const normalizedTipoImovel = this.fields["tipo_imovel"]; 

        // A 'categoria' também foi normalizada (lowercase)
        // e é confiada como vinda do servidor.

        if (normalizedTipoImovel in CAPITALIZATION_MAP) {
            this.fields["tipo_imovel"] = CAPITALIZATION_MAP[normalizedTipoImovel];
            
            // O campo 'categoria' (ex: "residencial" ou "comercial")
            // é simplesmente passado adiante, como veio do servidor.
        } else {
            this.errors.push(`Tipo de imóvel inválido ou desconhecido: ${normalizedTipoImovel}`);
        }
    }
}
