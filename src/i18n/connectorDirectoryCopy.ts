import type { Language } from './languagePreference';
import type { ConnectorHost } from '../../shared/connector-catalogue.mjs';
import { connectorCopy } from './connectorCopy';

const en = {
  assistant: 'AI assistants', builder: 'App builders', editor: 'Editors & coding agents',
  action: 'Open setup instructions', config: 'Configuration — merge with existing servers',
  copyConfig: 'Copy configuration', configCopied: 'Configuration copied',
  settings1: 'Open this assistant’s custom MCP settings using its official instructions below.',
  settings2: 'Add Sajda with the public server URL above. This public connection needs no Sajda API key.',
  settings3: 'Review the tools and enable Sajda in your conversation. Your host’s plan and workspace rules apply.',
  config1: 'Open your client’s MCP configuration. The official guide below shows where to find it.',
  config2: 'Merge the configuration below with your existing servers. Keep your other connections and tool approvals.',
  config3: 'Reload or reconnect the client, then ask it to use Sajda. Review any tool-approval prompt.',
  perplexity: 'Custom remote MCP access requires a supported Perplexity Pro, Max or Enterprise plan and the relevant workspace permission.',
  windsurf: 'These instructions apply to the supported Cascade MCP configuration. Follow the current official guide for your installed Windsurf/Devin version.',
  review: 'Documented setup, not marketplace approval or a completed installation test in every client. Logos identify the respective products; no partnership is implied.',
};
type Copy = { [K in keyof typeof en]: string };
export const connectorDirectoryCopy: Record<Language, Copy> = {
  en,
  sv: {
    assistant: 'AI-assistenter', builder: 'Appbyggare', editor: 'Editorer och kodassistenter',
    action: 'Öppna installationsguiden', config: 'Konfiguration — slå ihop med befintliga servrar',
    copyConfig: 'Kopiera konfiguration', configCopied: 'Konfigurationen kopierad',
    settings1: 'Öppna assistentens inställningar för egna MCP-anslutningar med hjälp av den officiella guiden nedan.',
    settings2: 'Lägg till Sajda med den publika serveradressen ovan. Den publika anslutningen behöver ingen API-nyckel från Sajda.',
    settings3: 'Granska verktygen och aktivera Sajda i samtalet. Värdtjänstens abonnemang och arbetsytans regler gäller.',
    config1: 'Öppna klientens MCP-konfiguration. Den officiella guiden nedan visar var den finns.',
    config2: 'Slå ihop konfigurationen nedan med dina befintliga servrar. Behåll andra anslutningar och krav på verktygsgodkännande.',
    config3: 'Ladda om eller återanslut klienten och be den använda Sajda. Granska eventuella frågor om verktygsbehörighet.',
    perplexity: 'Egna fjärranslutningar via MCP kräver ett Perplexity Pro-, Max- eller Enterprise-abonnemang som stöder funktionen och rätt behörighet i arbetsytan.',
    windsurf: 'Instruktionerna gäller MCP-konfigurationen i Cascade. Följ den aktuella officiella guiden för din installerade version av Windsurf/Devin.',
    review: 'Dokumenterade anslutningsvägar, inte ett godkännande i en marknadsplats eller en verifierad installation i varje klient. Logotyperna identifierar produkterna och innebär inget partnerskap.',
  },
  es: {
    assistant: 'Asistentes de IA', builder: 'Creadores de aplicaciones', editor: 'Editores y agentes de código',
    action: 'Abrir la guía de configuración', config: 'Configuración: combinar con los servidores existentes',
    copyConfig: 'Copiar configuración', configCopied: 'Configuración copiada',
    settings1: 'Abre los ajustes de MCP personalizado del asistente siguiendo la guía oficial de abajo.',
    settings2: 'Añade Sajda con la URL pública de arriba. Esta conexión pública no necesita una clave API de Sajda.',
    settings3: 'Revisa las herramientas y activa Sajda en la conversación. Se aplican el plan del servicio y las reglas del espacio de trabajo.',
    config1: 'Abre la configuración MCP del cliente. La guía oficial de abajo indica dónde encontrarla.',
    config2: 'Combina la configuración de abajo con tus servidores existentes. Conserva las demás conexiones y las aprobaciones de herramientas.',
    config3: 'Recarga o vuelve a conectar el cliente y pídele que use Sajda. Revisa las solicitudes de permiso.',
    perplexity: 'El acceso a MCP remoto personalizado requiere un plan compatible de Perplexity Pro, Max o Enterprise y los permisos correspondientes.',
    windsurf: 'Estas instrucciones corresponden a la configuración MCP de Cascade. Sigue la guía oficial vigente para tu versión de Windsurf/Devin.',
    review: 'Son instrucciones documentadas, no una aprobación del marketplace ni una instalación probada en cada cliente. Los logotipos identifican los productos y no implican una asociación.',
  },
  fr: {
    assistant: 'Assistants IA', builder: 'Créateurs d’applications', editor: 'Éditeurs et agents de code',
    action: 'Ouvrir le guide de configuration', config: 'Configuration — à fusionner avec les serveurs existants',
    copyConfig: 'Copier la configuration', configCopied: 'Configuration copiée',
    settings1: 'Ouvrez les paramètres MCP personnalisés de l’assistant en suivant le guide officiel ci-dessous.',
    settings2: 'Ajoutez Sajda avec l’URL publique ci-dessus. Cette connexion publique ne nécessite aucune clé API Sajda.',
    settings3: 'Vérifiez les outils et activez Sajda dans la conversation. L’abonnement du service et les règles de l’espace de travail s’appliquent.',
    config1: 'Ouvrez la configuration MCP du client. Le guide officiel ci-dessous indique où la trouver.',
    config2: 'Fusionnez la configuration ci-dessous avec vos serveurs existants. Conservez les autres connexions et les autorisations des outils.',
    config3: 'Rechargez ou reconnectez le client, puis demandez-lui d’utiliser Sajda. Vérifiez toute demande d’autorisation.',
    perplexity: 'Les connexions MCP distantes personnalisées nécessitent un abonnement Perplexity Pro, Max ou Enterprise compatible et les autorisations requises.',
    windsurf: 'Ces instructions concernent la configuration MCP de Cascade. Suivez le guide officiel actuel de votre version de Windsurf/Devin.',
    review: 'Ces parcours sont documentés, mais ne constituent ni une approbation sur une marketplace ni un test d’installation dans chaque client. Les logos identifient les produits sans impliquer de partenariat.',
  },
  zh: {
    assistant: 'AI 助手', builder: '应用构建工具', editor: '编辑器与编程智能体',
    action: '打开配置指南', config: '配置 — 请合并到现有服务器配置中',
    copyConfig: '复制配置', configCopied: '已复制配置',
    settings1: '按照下方官方指南打开助手的自定义 MCP 设置。',
    settings2: '使用上方公共服务器地址添加 Sajda。公共连接不需要 Sajda API 密钥。',
    settings3: '检查工具并在对话中启用 Sajda。仍需满足宿主平台的套餐要求和工作区规则。',
    config1: '打开客户端的 MCP 配置。下方官方指南说明了配置位置。',
    config2: '将下方配置合并到现有服务器配置中。保留其他连接和工具审批设置。',
    config3: '重新加载或连接客户端，然后要求它使用 Sajda。请检查工具权限确认提示。',
    perplexity: '自定义远程 MCP 需要支持该功能的 Perplexity Pro、Max 或 Enterprise 套餐以及相应工作区权限。',
    windsurf: '这些说明适用于 Cascade MCP 配置。请遵循所安装 Windsurf/Devin 版本的最新官方指南。',
    review: '这里提供已查阅文档的配置方法，不代表已获应用市场批准或已在每个客户端完成安装测试。标志仅用于识别产品，不表示合作关系。',
  },
};

const originalHosts = ['chatgpt', 'claude', 'grok', 'cursor', 'replit', 'lovable'] as const;
export function connectorInstructions(language: Language, host: { id: ConnectorHost; configKind: string }) {
  const c = connectorCopy[language], d = connectorDirectoryCopy[language];
  if (originalHosts.includes(host.id as typeof originalHosts[number])) {
    const id = host.id as typeof originalHosts[number];
    return { steps: [c[`${id}Step1`], c[`${id}Step2`], c[`${id}Step3`]], action: c[`${id}Action`] };
  }
  return { steps: host.configKind === 'none' ? [d.settings1, d.settings2, d.settings3] : [d.config1, d.config2, d.config3], action: d.action };
}
