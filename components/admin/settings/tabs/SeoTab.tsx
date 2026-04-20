"use client";

import {
  SettingsSection,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import { GoogleVerificationForm } from "@/components/admin/settings/GoogleVerificationForm";

type Props = {
  googleVerification: { content: string };
};

export function SeoTab(p: Props) {
  return (
    <div className="space-y-5">
      <TabHeader
        title="SEO"
        description="Verificações de propriedade e ajustes globais de SEO."
      />
      <SettingsSection
        title="Google Search Console"
        description="Cole o conteúdo da meta-tag fornecida pelo Google (sem aspas)."
      >
        <GoogleVerificationForm initial={p.googleVerification} />
      </SettingsSection>
    </div>
  );
}
