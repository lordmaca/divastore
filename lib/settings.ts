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
