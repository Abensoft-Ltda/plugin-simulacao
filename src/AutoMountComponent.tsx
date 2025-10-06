import React from 'react';
import { createRoot } from 'react-dom/client';

interface AutoMountComponentProps {
  Component: React.ComponentType<{ data: any }>;
  containerId: string;
  containerStyles?: Partial<CSSStyleDeclaration>;
  logPrefix: string;
  registerLog: (message: string) => void;
  printLogs: () => void;
}

export const AutoMountComponent: React.FC<AutoMountComponentProps> = ({
  Component,
  containerId,
  containerStyles = {},
  logPrefix,
  registerLog,
  printLogs
}) => {
  React.useEffect(() => {
    async function main() {
      try {
        const data = (window as any).__CAIXA_AUTO_MOUNT_DATA;
        if (data) {
          registerLog(`[${logPrefix}] Auto-montando com dados pré-carregados.`);
          printLogs();
          
          const container = document.createElement('div');
          container.id = containerId;
          
          // Aplicar apenas estilos personalizados se fornecidos, sem padrões
          Object.assign(container.style, containerStyles);

          document.body.appendChild(container);
          
          const root = createRoot(container);
          root.render(React.createElement(Component, { data }));

        } else {
          registerLog(`[${logPrefix}] Nenhum dado pré-carregado encontrado.`);
        }
      } catch (e: any) {
        // Usar ambos os métodos de log para máxima visibilidade em erros
        console.error(`[${logPrefix}] Auto-montagem falhou: ${e.message}`, e);
        registerLog(`[${logPrefix}] Auto-montagem falhou: ${e.message}`);
        printLogs();
      }
    }

    main();
  }, [Component, containerId, containerStyles, logPrefix, registerLog, printLogs]);

  return null; // Este componente não renderiza nada por si só
};