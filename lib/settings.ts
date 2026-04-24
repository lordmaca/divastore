import { prisma } from "@/lib/db";
import { DEFAULT_CATEGORY_RULES } from "@/lib/catalog/defaults";

// Typed settings registry. Keys, defaults, and JSON shape are pinned here so
// callers get autocomplete and we can never drift between writers and readers.
//
// Secrets DO NOT live here. Tokens (MP_ACCESS_TOKEN, TINY_API_TOKEN, etc.)
// stay in env + PM2 reload. SettingsKv only stores non-secret config and
// rotation lists (e.g. comma-separated DivaHub key hints).

export const SETTINGS_DEFINITIONS = {
  "site.banner": {
    label: "Banner do site",
    description: "Mensagem fixa exibida no topo do storefront. Vazio = sem banner.",
    default: { enabled: false, message: "" } as { enabled: boolean; message: string },
  },
  "seo.googleVerification": {
    label: "SEO — Google Search Console",
    description:
      "Conteúdo da meta-tag de verificação fornecida pelo Google Search Console (sem aspas).",
    default: { content: "" } as { content: string },
  },
  "shipping.freeThresholdCents": {
    label: "Frete grátis a partir de (R$)",
    description: "Valor mínimo do subtotal para frete grátis. 0 = desabilitado.",
    default: { cents: 0 } as { cents: number },
  },
  "stock.lowThreshold": {
    label: "Alerta de estoque baixo",
    description: "Variantes com estoque ≤ esse valor aparecem no dashboard.",
    default: { units: 3 } as { units: number },
  },
  "stock.tinySyncSafetyThresholdPct": {
    label: "Sincronização de estoque — limite de segurança (%)",
    description:
      "Se uma sincronização com o Tiny tentar zerar mais do que este percentual do catálogo em uma única execução, ela é abortada e um IntegrationRun é registrado como erro. Protege contra indisponibilidades parciais do Tiny.",
    default: { pct: 30 } as { pct: number },
  },
  "invoice.autoIssueOnPaid": {
    label: "NF-e — emitir automaticamente ao aprovar pagamento",
    description:
      "Quando ligado, o webhook do Mercado Pago solicita a emissão da NF-e no Tiny assim que o pedido entra em PAID. Desligue para emitir manualmente via /admin/pedidos.",
    default: { enabled: true } as { enabled: boolean },
  },
  "catalog.autoApplyHighConfidence": {
    label: "Categorias — aplicar automaticamente sugestões de alta confiança",
    description:
      "Quando ligado, produtos detectados como fora da categoria certa com alta confiança são movidos automaticamente pelo scan diário. Casos de média/baixa confiança continuam indo para /admin/produtos/categorias para revisão.",
    default: { enabled: true } as { enabled: boolean },
  },
  "catalog.categoryRules": {
    label: "Categorias — regras de classificação por nome",
    description:
      "Registro de padrões (regex) que casam com cada categoria. Cada padrão tem um peso; a categoria com maior pontuação é sugerida. excludeFromSuggestions contém slugs que nunca devem receber sugestão (catch-all e sandbox). Editável sem redeploy.",
    default: DEFAULT_CATEGORY_RULES,
  },
  "navigation.hiddenCategorySlugs": {
    label: "Navegação — categorias ocultas no header/footer",
    description:
      "Slugs de categoria que NUNCA aparecem no menu do topo nem no rodapé, mesmo que tenham produtos ativos. Usado para buckets catch-all (beleza) e sandbox (testes). As categorias continuam navegáveis via URL direta /loja?categoria=<slug>.",
    default: { slugs: ["beleza", "testes"] } as { slugs: string[] },
  },
  "melhorenvio.env": {
    label: "Melhor Envio — ambiente",
    description:
      "Ambiente da API do Melhor Envio. `sandbox` para testes; `production` para carteira real.",
    default: { env: "sandbox" } as { env: "sandbox" | "production" },
  },
  "divahub.outbound": {
    label: "DivaHub — saída (outbound)",
    description:
      "URL da API pública do DivaHub. Usada em imports de catálogo outbound. A chave de API é um segredo armazenado separadamente.",
    default: { url: "" } as { url: string },
  },
  "divinha.enabled": {
    label: "Divinha — assistente de IA no site",
    description:
      "Liga/desliga o widget de chat da Divinha no storefront. Se desligado, o botão flutuante some e a rota /api/chat/turn responde 503. Use como kill switch se o DivaHub estiver instável.",
    default: { enabled: false } as { enabled: boolean },
  },
  "alerts.config": {
    label: "Observabilidade — alertas por e-mail",
    description:
      "Destinatários e limites do sistema de alertas. O scanner roda a cada 15 minutos e envia um e-mail consolidado quando detecta falhas de integração, backup atrasado, cron parado ou banco fora do ar. Respeita um cooldown por alerta — não spamma.",
    default: {
      enabled: true,
      recipients: [
        "vpapa@pelotongroup.com",
        "viniciuspapa@gmail.com",
        "adm@brilhodediva.com.br",
      ],
      // Minutos entre re-envios de e-mail do mesmo alerta ativo.
      emailCooldownMinutes: 60,
      // Nº de falhas consecutivas (mesma adapter+operation) até disparar um alerta.
      integrationFailureStreak: 3,
      // Janela máxima sem backup bem-sucedido antes de alertar (horas).
      backupMaxAgeHours: 26,
      // Janela máxima sem heartbeat de cron antes de alertar (multiplicador
      // sobre o intervalo esperado da própria cron, mínimo 30 min).
      cronMaxMissedMultiplier: 2,
    } as {
      enabled: boolean;
      recipients: string[];
      emailCooldownMinutes: number;
      integrationFailureStreak: number;
      backupMaxAgeHours: number;
      cronMaxMissedMultiplier: number;
    },
  },
  "about.page": {
    label: "Página Sobre nós",
    description:
      "Conteúdo da página /sobre. Mídia: uma foto ou vídeo da loja física. Para vídeo, cole a URL do YouTube ou do arquivo mp4.",
    default: {
      enabled: true,
      heading: "Sobre nós",
      tagline: "Da nossa vitrine em Mauá para o Brasil inteiro — com carinho.",
      story:
        "Somos da cidade de Mauá, SP. Nossa loja fica no Shopping Nova Estação e abrimos as portas no dia 25 de maio de 2025. Desde então, temos um propósito só: levar inovação por meio de produtos de qualidade e preço acessível — primeiro para a gente daqui, e agora para o Brasil todo.",
      media: {
        type: "none" as "image" | "video" | "none",
        url: "",
        alt: "Loja Brilho de Diva no Shopping Nova Estação",
      },
      pillars: [
        {
          icon: "✨",
          title: "Qualidade",
          description:
            "Semi-joias em aço inox 316L e prata 925, testadas e selecionadas por quem usa.",
        },
        {
          icon: "💞",
          title: "Preço acessível",
          description:
            "Porque brilhar não precisa doer no bolso. Cada peça é pensada para caber no dia a dia.",
        },
        {
          icon: "🌟",
          title: "Inovação",
          description:
            "Novidades toda semana, atendimento humano e a Divinha (nossa IA) pronta para ajudar.",
        },
      ],
      visit: {
        storeName: "Brilho de Diva — Shopping Nova Estação",
        address: "Shopping Nova Estação",
        city: "Mauá",
        state: "SP",
        openingDateIso: "2025-05-25",
        hours: "Seg a Sáb, 10h às 22h · Dom, 14h às 20h",
        mapUrl: "",
        shoppingUrl: "",
      },
      contact: {
        whatsapp: "",
        instagram: "",
        email: "contato@brilhodediva.com.br",
      },
    } as {
      enabled: boolean;
      heading: string;
      tagline: string;
      story: string;
      media: {
        type: "image" | "video" | "none";
        url: string;
        alt: string;
      };
      pillars: Array<{ icon: string; title: string; description: string }>;
      visit: {
        storeName: string;
        address: string;
        city: string;
        state: string;
        openingDateIso: string;
        hours: string;
        mapUrl: string;
        shoppingUrl: string;
      };
      contact: { whatsapp: string; instagram: string; email: string };
    },
  },
  "s3.config": {
    label: "Armazenamento — configuração",
    description:
      "Endpoint + região + buckets + prefixo + base URL pública do provedor S3. Credenciais (access key / secret key) são armazenadas criptografadas separadamente.",
    default: {
      endpoint: "",
      region: "sa-saopaulo-1",
      publicBucket: "",
      privateBucket: "",
      prefix: "",
      publicBaseUrl: "",
    } as {
      endpoint: string;
      region: string;
      publicBucket: string;
      privateBucket: string;
      prefix: string;
      publicBaseUrl: string;
    },
  },
  "whatsapp.config": {
    label: "WhatsApp — configuração",
    description:
      "Phone Number ID do WhatsApp Business Cloud API + versão da Graph API. O token de acesso é armazenado criptografado separadamente.",
    default: {
      phoneNumberId: "",
      apiVersion: "v21.0",
    } as {
      phoneNumberId: string;
      apiVersion: string;
    },
  },
  "email.smtp": {
    label: "E-mail — SMTP",
    description:
      "Host, porta e remetente para e-mails transacionais (confirmações, rastreio, NF-e, recuperação de senha). Usuário e senha são armazenados criptografados separadamente.",
    default: {
      host: "",
      port: 465,
      from: "",
      replyTo: "",
    } as {
      host: string;
      port: number;
      from: string;
      replyTo?: string;
    },
  },
  "tiny.baseUrl": {
    label: "Tiny ERP — base URL",
    description: "Endpoint da API Tiny v2. Fallback para api.tiny.com.br.",
    default: { url: "https://api.tiny.com.br/api2" } as { url: string },
  },
  "mp.publicKeyHint": {
    label: "Mercado Pago — Public Key",
    description:
      "Public key do Mercado Pago. Não é um segredo (é exposta no frontend pelo SDK) — armazenada em claro no banco para referência e uso futuro em Bricks.",
    default: { hint: "" } as { hint: string },
  },
  "divahub.inboundKeys": {
    label: "DivaHub — chaves de entrada (rotação)",
    description:
      "Chaves válidas para o endpoint DivaHub inbound, além do env. Adicionar uma chave aqui vale imediatamente (sem reload de PM2). Use para rotação zero-downtime. Armazenadas apenas como hash (SHA-256) — o valor da chave é exibido uma única vez no momento da geração.",
    default: {
      keys: [] as Array<{
        id: string;
        tokenHash: string;
        prefix: string;
        hint: string;
        label?: string;
        addedAt: string;
        // Legacy plaintext field kept only so old rows deserialize; migrated on read.
        token?: string;
      }>,
    } as {
      keys: Array<{
        id: string;
        tokenHash: string;
        prefix: string;
        hint: string;
        label?: string;
        addedAt: string;
        token?: string;
      }>;
    },
  },
  "shipping.origin": {
    label: "Frete — endereço de origem",
    description:
      "Endereço do depósito/remetente. Usado em cotação e compra de etiquetas (Melhor Envio exige nome, telefone e CNPJ do remetente para gerar a etiqueta). CEP só números (8 dígitos).",
    default: {
      cep: "",
      street: "",
      number: "",
      complement: "",
      district: "",
      city: "",
      state: "",
      recipient: "Brilho de Diva",
      phone: "",
      email: "",
      cnpj: "",
    } as {
      cep: string;
      street: string;
      number: string;
      complement?: string;
      district: string;
      city: string;
      state: string;
      recipient: string;
      phone?: string;
      email?: string;
      cnpj?: string;
    },
  },
  "shipping.defaultPackage": {
    label: "Frete — pacote padrão (fallback)",
    description:
      "Dimensões usadas quando a variante não tem width/height/length. Caixa pequena de joia por padrão.",
    default: { widthCm: 15, heightCm: 5, lengthCm: 10, weightG: 150 } as {
      widthCm: number;
      heightCm: number;
      lengthCm: number;
      weightG: number;
    },
  },
  "shipping.insuranceOn": {
    label: "Frete — declarar valor (seguro)",
    description:
      "Declara o valor dos itens no envio. Recomendado para joias; pode encarecer o frete.",
    default: { enabled: true } as { enabled: boolean },
  },
  "shipping.carriersAllowed": {
    label: "Frete — serviços habilitados",
    description:
      "IDs dos serviços Melhor Envio a exibir. Vazio = todos. Ex: ['1','2','3'] para PAC/SEDEX/Jadlog.",
    default: { serviceIds: [] as string[] } as { serviceIds: string[] },
  },
  "shipping.provider": {
    label: "Frete — provedor",
    description: "Provedor de frete ativo e ambiente. Única opção hoje: Melhor Envio.",
    default: { kind: "melhorenvio", env: "sandbox" } as {
      kind: "melhorenvio";
      env: "sandbox" | "production";
    },
  },
  "home.hero": {
    label: "Home — topo (hero)",
    description:
      "Cartão do hero da home: sobreletra (kicker), título, subtítulo e dois CTAs. Desative quando quiser esconder o cartão inteiro (ex.: quando tiver um hero de imagem na Fase 2).",
    default: {
      enabled: true,
      kicker: "Joias feitas para brilhar",
      title: "Brilho de Diva",
      subtitle: "Realce sua Beleza, Brilhe como uma Diva!",
      ctaPrimary: { label: "Explorar a coleção", url: "/loja" },
      ctaSecondary: { label: "Ofertas", url: "/loja?ordenar=mais-vendidos" },
    } as {
      enabled: boolean;
      kicker: string;
      title: string;
      subtitle: string;
      ctaPrimary: { label: string; url: string };
      ctaSecondary: { label: string; url: string };
    },
  },
  "home.usps": {
    label: "Home — barra de benefícios (USP bar)",
    description:
      "Até 4 benefícios exibidos em faixa logo abaixo do hero. icon é um emoji; text a frase curta.",
    default: {
      items: [
        { icon: "🚚", text: "Frete grátis acima de R$ 300" },
        { icon: "💳", text: "Até 12x no cartão" },
        { icon: "🔄", text: "Troca grátis em 7 dias" },
        { icon: "✨", text: "Prata 925 e garantia de 1 ano" },
      ],
    } as {
      items: Array<{ icon: string; text: string }>;
    },
  },
  "home.featuredCategories": {
    label: "Home — categorias em destaque",
    description:
      "Slugs das categorias mostradas em tiles na home. Vazio = detecta automaticamente as 4 categorias com mais produtos ativos.",
    default: { slugs: [] as string[] } as { slugs: string[] },
  },
  "home.badges": {
    label: "Home — badges no carousel de destaques",
    description:
      "Regras para marcar produtos com 'Novo' (criados nos últimos N dias) e 'Mais vendido' (top 3 por pedidos no último mês).",
    default: {
      newDays: 30,
      showBestseller: true,
    } as {
      newDays: number;
      showBestseller: boolean;
    },
  },
  "home.newsletter": {
    label: "Home — bloco newsletter",
    description:
      "Seção de captura de e-mail com cupom de boas-vindas. Desative se não quiser exibir.",
    default: {
      enabled: true,
      headline: "Ganhe 10% OFF na primeira compra",
      sub: "Entre pra lista e receba as novidades, promoções e inspirações — direto na sua caixa.",
      couponCode: "BEMVINDA10",
    } as {
      enabled: boolean;
      headline: string;
      sub: string;
      couponCode: string;
    },
  },
  "home.reviews": {
    label: "Home — bloco de avaliações",
    description:
      "Exibe avaliações recentes dos clientes na home para reforçar prova social. Desative pra esconder a seção.",
    default: { enabled: true, limit: 3 } as { enabled: boolean; limit: number },
  },
  "home.heroSlides": {
    label: "Home — hero rotativo (slides com foto)",
    description:
      "Até 5 slides com foto full-bleed, headline e CTA. Quando houver slides ativos, substitui o cartão glass do hero. Use fotos 1920×1080 idealmente.",
    default: {
      autoplayMs: 5000,
      slides: [] as Array<{
        id: string;
        imageUrl: string;
        imageAlt?: string;
        headline: string;
        sub?: string;
        ctaLabel: string;
        ctaUrl: string;
        activeFrom?: string;
        activeUntil?: string;
      }>,
    } as {
      autoplayMs: number;
      slides: Array<{
        id: string;
        imageUrl: string;
        imageAlt?: string;
        headline: string;
        sub?: string;
        ctaLabel: string;
        ctaUrl: string;
        activeFrom?: string;
        activeUntil?: string;
      }>;
    },
  },
  "home.campaignBanner": {
    label: "Home — banner de campanha (intermediário)",
    description:
      "Banner horizontal entre o carrossel de destaques e a newsletter. Use pra campanhas sazonais (Dia das Mães, Natal, etc.).",
    default: {
      enabled: false,
      imageUrl: "",
      imageAlt: "",
      headline: "",
      sub: "",
      ctaLabel: "",
      ctaUrl: "",
    } as {
      enabled: boolean;
      imageUrl: string;
      imageAlt: string;
      headline: string;
      sub: string;
      ctaLabel: string;
      ctaUrl: string;
    },
  },
  "home.lookbook": {
    label: "Home — lookbook (grid editorial)",
    description:
      "Grade de fotos editoriais com caption + link. Use fotos quadradas 800×800. Recomendado: 4 ou 6 tiles.",
    default: {
      enabled: false,
      headline: "Inspire-se",
      sub: "Looks e combinações que as Divas estão usando",
      items: [] as Array<{
        id: string;
        imageUrl: string;
        imageAlt?: string;
        caption?: string;
        linkUrl?: string;
      }>,
    } as {
      enabled: boolean;
      headline: string;
      sub: string;
      items: Array<{
        id: string;
        imageUrl: string;
        imageAlt?: string;
        caption?: string;
        linkUrl?: string;
      }>;
    },
  },
} as const;

export type SettingKey = keyof typeof SETTINGS_DEFINITIONS;
export type SettingValue<K extends SettingKey> =
  (typeof SETTINGS_DEFINITIONS)[K]["default"];

type CacheEntry<V> = { value: V; expiresAt: number };
const cache = new Map<SettingKey, CacheEntry<unknown>>();
const TTL_MS = 60_000;

export async function getSetting<K extends SettingKey>(key: K): Promise<SettingValue<K>> {
  const now = Date.now();
  const hit = cache.get(key);
  if (hit && hit.expiresAt > now) return hit.value as SettingValue<K>;

  const row = await prisma.settingsKv.findUnique({ where: { key } });
  const value = (row?.value ?? SETTINGS_DEFINITIONS[key].default) as SettingValue<K>;
  cache.set(key, { value, expiresAt: now + TTL_MS });
  return value;
}

export async function setSetting<K extends SettingKey>(
  key: K,
  value: SettingValue<K>,
  by: string | null,
): Promise<void> {
  await prisma.settingsKv.upsert({
    where: { key },
    create: { key, value: value as never, updatedBy: by },
    update: { value: value as never, updatedBy: by },
  });
  cache.delete(key);
}

export function listSettings() {
  return Object.entries(SETTINGS_DEFINITIONS).map(([key, def]) => ({
    key: key as SettingKey,
    label: def.label,
    description: def.description,
    default: def.default,
  }));
}
