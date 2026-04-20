"use client";

import { useState } from "react";
import { ShippingOptions } from "./ShippingOptions";
import { CepAutofill } from "./CepAutofill";

type Option = {
  serviceId: string;
  carrier: string;
  name: string;
  priceCents: number;
  etaDays: number;
};

type Props = {
  items: Array<{ variantId: string; qty: number }>;
  subtotalCents: number;
  freeThresholdCents: number;
};

// Bridges the ShippingOptions client UI to the outer server-action form via
// hidden inputs. The server action reads:
//   shippingCents, shippingCarrier, shippingServiceId, shippingEtaDays.
//
// Also mounts CepAutofill so typing the CEP in the sibling address fields
// populates street/district/city/UF automatically.
export function ShippingSection({ items, subtotalCents, freeThresholdCents }: Props) {
  const [chosen, setChosen] = useState<Option | null>(null);

  return (
    <>
      <CepAutofill
        cepFieldName="cep"
        targets={{ street: "street", district: "district", city: "city", state: "state" }}
      />
      <div className="border-t border-white/70 pt-4">
        <ShippingOptions
          cepFieldName="cep"
          items={items}
          subtotalCents={subtotalCents}
          freeThresholdCents={freeThresholdCents}
          onChange={setChosen}
        />
      </div>
      <input type="hidden" name="shippingCents" value={chosen?.priceCents ?? 0} />
      <input type="hidden" name="shippingCarrier" value={chosen?.carrier ?? ""} />
      <input type="hidden" name="shippingServiceId" value={chosen?.serviceId ?? ""} />
      <input type="hidden" name="shippingEtaDays" value={chosen?.etaDays ?? ""} />
    </>
  );
}
