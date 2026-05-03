"use client";

import {
  SettingsSection,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import { GoogleVerificationForm } from "@/components/admin/settings/GoogleVerificationForm";
import { GoogleCustomerReviewsForm } from "@/components/admin/settings/GoogleCustomerReviewsForm";

type Props = {
  googleVerification: { content: string };
  googleCustomerReviews: { enabled: boolean; merchantId: number };
};

export function SeoTab(p: Props) {
  return (
    <div className="space-y-5">
      <TabHeader
        title="SEO"
        description="Verificações de propriedade e integrações com produtos do Google."
      />
      <SettingsSection
        title="Google Search Console"
        description="Cole o conteúdo da meta-tag fornecida pelo Google (sem aspas)."
      >
        <GoogleVerificationForm initial={p.googleVerification} />
      </SettingsSection>
      <SettingsSection
        title="Google Customer Reviews"
        description="Pop-up de opt-in pós-compra na página /checkout/sucesso. Cliente recebe a pesquisa do Google por e-mail."
      >
        <GoogleCustomerReviewsForm initial={p.googleCustomerReviews} />
      </SettingsSection>
    </div>
  );
}
