import { requireAdmin } from "@/lib/admin";
import { prisma } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { getSecretStatus } from "@/lib/settings/config";
import { encryptionKeyConfigured } from "@/lib/settings/secrets";
import { emailConfigured } from "@/lib/notifications/channels/email";

import {
  SettingsShell,
  type SettingsTab,
} from "@/components/admin/settings/SettingsShell";
import { EmailTab } from "@/components/admin/settings/tabs/EmailTab";
import { PaymentsTab } from "@/components/admin/settings/tabs/PaymentsTab";
import { ErpTab } from "@/components/admin/settings/tabs/ErpTab";
import { LogisticsTab } from "@/components/admin/settings/tabs/LogisticsTab";
import { DivahubTab } from "@/components/admin/settings/tabs/DivahubTab";
import { StorageTab } from "@/components/admin/settings/tabs/StorageTab";
import { WhatsAppTab } from "@/components/admin/settings/tabs/WhatsAppTab";
import { StoreTab } from "@/components/admin/settings/tabs/StoreTab";
import { SeoTab } from "@/components/admin/settings/tabs/SeoTab";
import { NavigationTab } from "@/components/admin/settings/tabs/NavigationTab";
import { CatalogTab } from "@/components/admin/settings/tabs/CatalogTab";
import { BootstrapTab } from "@/components/admin/settings/tabs/BootstrapTab";
import { HomeTab } from "@/components/admin/settings/tabs/HomeTab";

export const dynamic = "force-dynamic";

const TABS: SettingsTab[] = [
  { slug: "email", label: "E-mail", icon: "✉", section: "integrações" },
  { slug: "payments", label: "Pagamentos", icon: "💳", section: "integrações" },
  { slug: "erp", label: "ERP (Tiny)", icon: "📦", section: "integrações" },
  { slug: "logistics", label: "Logística", icon: "🚚", section: "integrações" },
  { slug: "divahub", label: "DivaHub", icon: "✨", section: "integrações" },
  { slug: "whatsapp", label: "WhatsApp", icon: "💬", section: "integrações" },
  { slug: "storage", label: "Armazenamento", icon: "🗄", section: "integrações" },
  { slug: "home", label: "Home", icon: "🏠", section: "loja" },
  { slug: "store", label: "Loja", icon: "🏬", section: "loja" },
  { slug: "seo", label: "SEO", icon: "🔎", section: "loja" },
  { slug: "navigation", label: "Navegação", icon: "🧭", section: "loja" },
  { slug: "catalog", label: "Catálogo", icon: "🏷", section: "loja" },
  { slug: "bootstrap", label: "Bootstrap (env)", icon: "⚙", section: "avançado" },
];

function last4(v: string | undefined): string | null {
  if (!v) return null;
  return v.length >= 4 ? v.slice(-4) : v;
}

export default async function ConfiguracoesPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const admin = await requireAdmin();
  const { tab } = await searchParams;
  const activeSlug = tab && TABS.some((t) => t.slug === tab) ? tab : "email";

  return (
    <div className="space-y-6">
      <header>
        <h1 className="font-display text-3xl text-[color:var(--pink-600)]">Configurações</h1>
        <p className="text-sm text-[color:var(--foreground)]/70 mt-1">
          Secrets criptografados (AES-256-GCM) + ajustes não-secretos em banco. A chave mestra
          fica em <code>.env.local</code>; todo o resto é editável por aqui.
        </p>
      </header>

      <SettingsShell tabs={TABS} activeSlug={activeSlug}>
        {activeSlug === "email" ? <EmailTabServer adminEmail={admin.user.email ?? ""} /> : null}
        {activeSlug === "payments" ? <PaymentsTabServer /> : null}
        {activeSlug === "erp" ? <ErpTabServer /> : null}
        {activeSlug === "logistics" ? <LogisticsTabServer /> : null}
        {activeSlug === "divahub" ? <DivahubTabServer /> : null}
        {activeSlug === "whatsapp" ? <WhatsAppTabServer /> : null}
        {activeSlug === "storage" ? <StorageTabServer /> : null}
        {activeSlug === "home" ? <HomeTabServer /> : null}
        {activeSlug === "store" ? <StoreTabServer /> : null}
        {activeSlug === "seo" ? <SeoTabServer /> : null}
        {activeSlug === "navigation" ? <NavigationTabServer /> : null}
        {activeSlug === "catalog" ? <CatalogTabServer /> : null}
        {activeSlug === "bootstrap" ? <BootstrapTabServer /> : null}
      </SettingsShell>
    </div>
  );
}

async function EmailTabServer({ adminEmail }: { adminEmail: string }) {
  const [smtp, userSecret, passSecret, canSend] = await Promise.all([
    getSetting("email.smtp"),
    getSecretStatus("email.smtp.user"),
    getSecretStatus("email.smtp.pass"),
    emailConfigured(),
  ]);
  return (
    <EmailTab
      smtp={smtp}
      userSecret={{
        configured: userSecret.configured,
        source: userSecret.source,
        last4: userSecret.last4,
      }}
      passSecret={{
        configured: passSecret.configured,
        source: passSecret.source,
        last4: passSecret.last4,
      }}
      canSend={canSend}
      adminEmail={adminEmail}
    />
  );
}

async function PaymentsTabServer() {
  const [mpPublicKey, at, ws] = await Promise.all([
    getSetting("mp.publicKeyHint"),
    getSecretStatus("mp.accessToken"),
    getSecretStatus("mp.webhookSecret"),
  ]);
  return (
    <PaymentsTab
      mpPublicKey={mpPublicKey}
      secrets={{
        accessToken: at,
        webhookSecret: ws,
      }}
    />
  );
}

async function ErpTabServer() {
  const [tinyBaseUrl, apiToken, webhookSecret] = await Promise.all([
    getSetting("tiny.baseUrl"),
    getSecretStatus("tiny.apiToken"),
    getSecretStatus("tiny.webhookSecret"),
  ]);
  return (
    <ErpTab
      tinyBaseUrl={tinyBaseUrl}
      secrets={{
        apiToken,
        webhookSecret,
      }}
    />
  );
}

async function LogisticsTabServer() {
  const [
    shippingProvider,
    freeShipping,
    shippingInsurance,
    shippingCarriers,
    shippingOrigin,
    shippingPackage,
    melhorEnvioEnvSetting,
    token,
    webhookSecret,
  ] = await Promise.all([
    getSetting("shipping.provider"),
    getSetting("shipping.freeThresholdCents"),
    getSetting("shipping.insuranceOn"),
    getSetting("shipping.carriersAllowed"),
    getSetting("shipping.origin"),
    getSetting("shipping.defaultPackage"),
    getSetting("melhorenvio.env"),
    getSecretStatus("melhorenvio.token"),
    getSecretStatus("melhorenvio.webhookSecret"),
  ]);
  return (
    <LogisticsTab
      shippingProvider={shippingProvider}
      freeShipping={freeShipping}
      shippingInsurance={shippingInsurance}
      shippingCarriers={shippingCarriers}
      shippingOrigin={shippingOrigin}
      shippingPackage={shippingPackage}
      melhorEnvioEnv={melhorEnvioEnvSetting.env}
      secrets={{
        token,
        webhookSecret,
      }}
    />
  );
}

async function DivahubTabServer() {
  const [outbound, apiKey, inboundApiKey] = await Promise.all([
    getSetting("divahub.outbound"),
    getSecretStatus("divahub.apiKey"),
    getSecretStatus("divahub.inboundApiKey"),
  ]);
  return (
    <DivahubTab
      outbound={outbound}
      secrets={{ apiKey, inboundApiKey }}
    />
  );
}

async function WhatsAppTabServer() {
  const [config, accessToken] = await Promise.all([
    getSetting("whatsapp.config"),
    getSecretStatus("whatsapp.accessToken"),
  ]);
  return (
    <WhatsAppTab
      config={config}
      secrets={{
        accessToken: {
          configured: accessToken.configured,
          source: accessToken.source,
          last4: accessToken.last4,
        },
      }}
    />
  );
}

async function StorageTabServer() {
  const { s3Enabled, s3PrivateEnabled } = await import("@/lib/s3");
  const [plain, accessKeyId, secretAccessKey, publicOk, privateOk] = await Promise.all([
    getSetting("s3.config"),
    getSecretStatus("s3.accessKeyId"),
    getSecretStatus("s3.secretAccessKey"),
    s3Enabled(),
    s3PrivateEnabled(),
  ]);
  return (
    <StorageTab
      plain={plain}
      secrets={{
        accessKeyId,
        secretAccessKey,
      }}
      effective={{
        publicConfigured: publicOk,
        privateConfigured: privateOk,
      }}
    />
  );
}

async function HomeTabServer() {
  const [hero, usps, featured, badges, newsletter, reviews, heroSlides, campaign, lookbook, cats, slideRows] = await Promise.all([
    getSetting("home.hero"),
    getSetting("home.usps"),
    getSetting("home.featuredCategories"),
    getSetting("home.badges"),
    getSetting("home.newsletter"),
    getSetting("home.reviews"),
    getSetting("home.heroSlides"),
    getSetting("home.campaignBanner"),
    getSetting("home.lookbook"),
    prisma.category.findMany({
      select: {
        slug: true,
        name: true,
        _count: { select: { products: { where: { active: true } } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.heroSlide.findMany({
      orderBy: [{ enabled: "desc" }, { updatedAt: "desc" }],
      include: {
        product: {
          select: {
            name: true,
            active: true,
            variants: { select: { stock: true } },
          },
        },
      },
    }),
  ]);
  return (
    <HomeTab
      hero={hero}
      usps={usps}
      featured={featured}
      badges={badges}
      newsletter={newsletter}
      reviews={reviews}
      heroSlides={heroSlides}
      heroSlideRows={slideRows.map((s) => {
        const stockSum = s.product?.variants.reduce((a, v) => a + v.stock, 0) ?? 0;
        return {
          id: s.id,
          externalId: s.externalId,
          source: s.source,
          imageUrl: s.imageUrl,
          imageAlt: s.imageAlt,
          headline: s.headline,
          sub: s.sub,
          ctaLabel: s.ctaLabel,
          ctaUrl: s.ctaUrl,
          headlineOverride: s.headlineOverride,
          subOverride: s.subOverride,
          ctaLabelOverride: s.ctaLabelOverride,
          ctaUrlOverride: s.ctaUrlOverride,
          enabled: s.enabled,
          weight: s.weight,
          productLinked: Boolean(s.productId),
          productName: s.product?.name ?? null,
          productActive: s.product ? s.product.active : null,
          productInStock: s.product ? stockSum > 0 : null,
          activeFrom: s.activeFrom?.toISOString() ?? null,
          activeUntil: s.activeUntil?.toISOString() ?? null,
          createdAt: s.createdAt.toISOString(),
        };
      })}
      campaign={campaign}
      lookbook={lookbook}
      availableCategories={cats.map((c) => ({
        slug: c.slug,
        name: c.name,
        productCount: c._count.products,
      }))}
    />
  );
}

async function StoreTabServer() {
  const [banner, stockLow] = await Promise.all([
    getSetting("site.banner"),
    getSetting("stock.lowThreshold"),
  ]);
  return <StoreTab banner={banner} stockLow={stockLow} />;
}

async function SeoTabServer() {
  const googleVerification = await getSetting("seo.googleVerification");
  return <SeoTab googleVerification={googleVerification} />;
}

async function NavigationTabServer() {
  const [hidden, categories] = await Promise.all([
    getSetting("navigation.hiddenCategorySlugs"),
    prisma.category.findMany({
      select: {
        slug: true,
        name: true,
        _count: { select: { products: { where: { active: true } } } },
      },
      orderBy: { name: "asc" },
    }),
  ]);
  return (
    <NavigationTab
      hiddenSlugs={hidden.slugs}
      allCategories={categories.map((c) => ({
        slug: c.slug,
        name: c.name,
        productCount: c._count.products,
      }))}
    />
  );
}

async function CatalogTabServer() {
  const [autoApply, rules, openCount] = await Promise.all([
    getSetting("catalog.autoApplyHighConfidence"),
    getSetting("catalog.categoryRules"),
    prisma.categoryAuditIssue.count({ where: { status: "OPEN" } }),
  ]);
  return (
    <CatalogTab
      autoApplyEnabled={autoApply.enabled}
      rulesSummary={rules.rules.map((r) => ({
        categorySlug: r.categorySlug,
        patternCount: r.patterns.length,
      }))}
      openIssues={openCount}
    />
  );
}

async function BootstrapTabServer() {
  return (
    <BootstrapTab
      encryptionKeyOk={encryptionKeyConfigured()}
      rows={[
        {
          label: "PostgreSQL",
          envVar: "DATABASE_URL",
          configured: Boolean(process.env.DATABASE_URL),
          hint: "definido",
          rotateWarning:
            "Rotacionar quebra toda conexão até reload. Faça com backup e em janela de manutenção.",
        },
        {
          label: "NextAuth URL",
          envVar: "AUTH_URL",
          configured: Boolean(process.env.AUTH_URL),
          hint: process.env.AUTH_URL,
        },
        {
          label: "NextAuth Secret",
          envVar: "AUTH_SECRET",
          configured: Boolean(process.env.AUTH_SECRET),
          hint: last4(process.env.AUTH_SECRET) ?? undefined,
          rotateWarning:
            "Rotacionar invalida todas as sessões logadas — clientes + admin caem para login.",
        },
        {
          label: "Chave mestra de criptografia",
          envVar: "SETTINGS_ENCRYPTION_KEY",
          configured: encryptionKeyConfigured(),
          hint: encryptionKeyConfigured() ? "64 hex chars" : undefined,
          rotateWarning:
            "Rotacionar invalida TODOS os secrets armazenados. Precisa re-cadastrá-los manualmente.",
        },
      ]}
    />
  );
}
