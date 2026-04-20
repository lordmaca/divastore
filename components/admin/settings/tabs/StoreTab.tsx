"use client";

import {
  SettingsSection,
  TabHeader,
} from "@/components/admin/settings/SettingsShell";
import { SiteBannerForm } from "@/components/admin/settings/SiteBannerForm";
import { StockLowThresholdForm } from "@/components/admin/settings/StockLowThresholdForm";

type Props = {
  banner: { enabled: boolean; message: string };
  stockLow: { units: number };
};

export function StoreTab(p: Props) {
  return (
    <div className="space-y-5">
      <TabHeader
        title="Loja"
        description="Comportamento padrão do storefront — banner promocional no topo e limiares de alerta."
      />
      <SettingsSection
        title="Banner do site"
        description="Aparece no topo de todas as páginas públicas. Vazio ou desativado = sem banner."
      >
        <SiteBannerForm initial={p.banner} />
      </SettingsSection>
      <SettingsSection
        title="Alerta de estoque baixo"
        description="Variantes com estoque ≤ esse valor são destacadas no painel administrativo."
      >
        <StockLowThresholdForm initial={p.stockLow} />
      </SettingsSection>
    </div>
  );
}
