import React, { useState, useEffect, useRef, forwardRef } from "react";

interface SimulationOverlayProps {
    title?: string;
    subtitle?: string;
    bankName?: string;
    bankIcon?: string;
    isComplete?: boolean;
    children: React.ReactNode;
}

type PrimaryButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
    importantPadding?: string;
    importantRadius?: string;
};

const OVERLAY_FONT_FAMILY =
    'Inter, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif';
const FONT_STYLE_OVERRIDES = `
.simulation-overlay-root {
  font-family: ${OVERLAY_FONT_FAMILY} !important;
}
.simulation-overlay-root h1[data-font="title"] {
  font-size: 2.25rem !important;
  line-height: 2.5rem !important;
  font-weight: 700 !important;
}
.simulation-overlay-root p[data-font="subtitle"] {
  font-size: 1.125rem !important;
  line-height: 1.75rem !important;
  font-weight: 400 !important;
}
.simulation-overlay-root p[data-font="bank-name"] {
  font-size: 0.875rem !important;
  line-height: 1.25rem !important;
  font-weight: 400 !important;
}
.simulation-overlay-root p[data-font="success-message"] {
  font-size: 1.125rem !important;
  line-height: 1.75rem !important;
  font-weight: 500 !important;
}
.simulation-overlay-root .simulation-overlay-primary-btn {
  font-size: 1rem !important;
  line-height: 1.5rem !important;
  font-weight: 700 !important;
}
.simulation-overlay-root button[data-font="hide-button"] {
  font-size: 0.75rem !important;
  line-height: 1rem !important;
  font-weight: 700 !important;
}
`;

const PrimaryButton = forwardRef<HTMLButtonElement, PrimaryButtonProps>(
    (
        { importantPadding = "12px 32px", importantRadius = "12px", style, children, ...rest },
        ref
    ) => {
        const innerRef = useRef<HTMLButtonElement | null>(null);

        useEffect(() => {
            const btn = innerRef.current;
            if (!btn) return;

            btn.style.setProperty("padding", importantPadding, "important");
            btn.style.setProperty("border-radius", importantRadius, "important");
            btn.style.setProperty("font-family", OVERLAY_FONT_FAMILY, "important");

            return () => {
                try {
                    btn.style.removeProperty("padding");
                    btn.style.removeProperty("border-radius");
                    btn.style.removeProperty("font-family");
                } catch (e) {
                    /* ignore */
                }
            };

        }, [importantPadding, importantRadius]);

        return (
            <button
                ref={(node) => {
                    innerRef.current = node;
                    if (!ref) return;
                    if (typeof ref === "function") ref(node);
                    else (ref as React.MutableRefObject<HTMLButtonElement | null>).current = node;
                }}
                style={style}
                {...rest}
            >
                {children}
            </button>
        );
    }
);

export const SimulationOverlay: React.FC<SimulationOverlayProps> = ({
                                                                        title = "Automação em Andamento",
                                                                        subtitle = "Processando simulação...",
                                                                        bankName = "Banco",
                                                                        bankIcon = "ibb-caixa",
                                                                        isComplete = false,
                                                                        children
                                                                    }) => {
    const [isWatching, setIsWatching] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);

    // Mostrar animação de sucesso quando completo
    useEffect(() => {
        if (isComplete) {
            setShowSuccess(true);
        }
    }, [isComplete]);

    // Carregar CSS dos ícones bancários
    useEffect(() => {
        const linkId = "bank-icons-css";
        if (!document.getElementById(linkId)) {
            const link = document.createElement("link");
            link.id = linkId;
            link.rel = "stylesheet";
            link.href =
                "https://cdn.jsdelivr.net/gh/matheusmcuba/icones-bancos-brasileiros@1.1/dist/all.css";
            document.head.appendChild(link);
        }
    }, []);

    // Injetar reforço de fontes com !important para evitar sobrescritas externas
    useEffect(() => {
        const styleId = "simulation-overlay-font-overrides";
        if (!document.getElementById(styleId)) {
            const style = document.createElement("style");
            style.id = styleId;
            style.textContent = FONT_STYLE_OVERRIDES;
            document.head.appendChild(style);
        }
    }, []);



    if (isWatching) {
        return (
            <>
                {children}
                <div
                    className="simulation-overlay-root fixed z-[999998] bottom-4 left-4"
                    style={{ fontFamily: OVERLAY_FONT_FAMILY }}
                    aria-label="Painel de visualização reduzido"
                >
                    <div className="flex items-center justify-center">
                        <PrimaryButton
                            onClick={() => setIsWatching(false)}
                            className="flex items-center gap-2 w-full justify-center bg-main-green hover:bg-green-600 text-white border-none rounded-md py-2 px-3"
                            style={{ fontFamily: OVERLAY_FONT_FAMILY }}
                            aria-label="Voltar"
                            data-font="hide-button"
                        >
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                className="h-4 w-4"
                                fill="none"
                                viewBox="0 0 24 24"
                                stroke="currentColor"
                                strokeWidth={2}
                                aria-hidden="true"
                            >
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
                            </svg>
                            <span className="text-sm font-medium">Voltar</span>
                        </PrimaryButton>
                    </div>
                </div>
            </>
        );
    }

    // Mostrar animação de sucesso quando completo
    if (showSuccess) {
        return (
            <>
                {children}
                <div
                    className="simulation-overlay-root fixed inset-0 w-screen h-screen bg-gray-700 z-[999999] flex items-center justify-center transition-opacity duration-500 ease-in-out"
                    style={{ fontFamily: OVERLAY_FONT_FAMILY }}
                >
                    <div className="text-center">
                        <div className="w-20 h-20 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4 transform transition-all duration-700 ease-out scale-110 animate-pulse">
                            <svg
                                className="w-10 h-10 text-white"
                                fill="currentColor"
                                viewBox="0 0 20 20"
                            >
                                <path
                                    fillRule="evenodd"
                                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                                    clipRule="evenodd"
                                />
                            </svg>
                        </div>
                        <p
                            className="text-lg font-medium"
                            style={{ color: "white" }}
                            data-font="success-message"
                        >{`Simulação concluída - ${bankName}`}</p>
                        <PrimaryButton
                            onClick={() => setIsWatching(true)}
                            className="simulation-overlay-primary-btn pl-8 pr-8 pt-3 pb-3 bg-main-green hover:bg-green-600 border-none rounded-lg text-base font-bold cursor-pointer shadow-lg transition-all duration-300 ease-in-out hover:scale-105"
                            style={{ color: "white", fontFamily: OVERLAY_FONT_FAMILY }}
                        >
                            Visualizar página
                        </PrimaryButton>
                    </div>
                </div>
            </>
        );
    }

    // Mostrar overlay em tela cheia correspondendo ao estilo popup.tsx
    return (
        <>
            {children}
            <div
                className="simulation-overlay-root fixed inset-0 w-screen h-screen bg-gray-700 z-[999999] flex flex-col items-center justify-center p-6"
                style={{ fontFamily: OVERLAY_FONT_FAMILY }}
            >
                {/* Ícone do Banco Animado */}
                <div className="mb-6 animate-pulse">
                    <div className="w-32 h-32 bg-gray-800 rounded-full flex justify-center items-center shadow-2xl border-4 border-gray-600">
                        <i
                            className={`${bankIcon} text-[70px]`}
                            style={{ lineHeight: 1, filter: "brightness(2.5) contrast(1.2)" }}
                        ></i>
                    </div>
                </div>

                {/* Título - TEXTO BRANCO */}
                <h1
                    className="text-4xl font-bold mb-3 text-center drop-shadow-lg"
                    style={{ color: "white" }}
                    data-font="title"
                >
                    {title}
                </h1>

                {/* Subtítulo - TEXTO BRANCO */}
                <p
                    className="text-lg mb-2 text-center drop-shadow-md"
                    style={{ color: "white" }}
                    data-font="subtitle"
                >
                    {subtitle}
                </p>

                {/* Nome do Banco - TEXTO BRANCO */}
                <p
                    className="text-sm mb-8 text-center drop-shadow-md"
                    style={{ color: "white" }}
                    data-font="bank-name"
                >
                    {bankName}
                </p>

                {/* Botão Exibir Processo - TEXTO CINZA ESCURO */}
                <PrimaryButton
                    onClick={() => setIsWatching(true)}
                    className="simulation-overlay-primary-btn bg-main-green hover:bg-green-600 border-none text-base font-bold cursor-pointer shadow-lg transition-all duration-300 ease-in-out hover:scale-105"
                    style={{ color: "white", fontFamily: OVERLAY_FONT_FAMILY }}
                >
                    Exibir processo de simulação
                </PrimaryButton>

                {/* Spinner de Carregamento - BRANCO */}
                <div className="mt-10 flex gap-2">
                    <div
                        className="w-3 h-3 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: "0s" }}
                    ></div>
                    <div
                        className="w-3 h-3 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: "0.2s" }}
                    ></div>
                    <div
                        className="w-3 h-3 bg-white rounded-full animate-bounce"
                        style={{ animationDelay: "0.4s" }}
                    ></div>
                </div>
            </div>
        </>
    );
};