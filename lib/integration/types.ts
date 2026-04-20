// Integration Center — adapter contracts.
// Each provider implements one or more of these interfaces.

export interface AdapterHealth {
  ok: boolean;
  detail?: string;
  checkedAt: Date;
}

export interface BaseAdapter {
  readonly name: string;
  // Runtime-async so adapters can read config from encrypted settings at call
  // time, not at module-load time. Callers that used to read a static
  // `.enabled` boolean need to `await` this.
  isEnabled(): Promise<boolean>;
  health(): Promise<AdapterHealth>;
}

export interface OrderPayload {
  storefrontOrderId: string;
  number: number;
  customer: { name: string; email: string; phone?: string; cpf?: string };
  shippingAddress: {
    cep: string;
    street: string;
    number: string;
    complement?: string;
    district: string;
    city: string;
    state: string;
    country: string;
  };
  items: Array<{ sku: string; qty: number; unitPriceCents: number; nameSnapshot: string }>;
  totalCents: number;
  shippingCents: number;
  discountCents: number;
  paidAt: Date;
  shipping?: {
    carrier?: string;
    serviceId?: string;
    trackingCode?: string;
    etaDays?: number;
  };
}

export interface OrderSink extends BaseAdapter {
  publishOrder(order: OrderPayload): Promise<{ externalId: string }>;
}

export interface CatalogSource extends BaseAdapter {
  listProducts(): Promise<Array<{ sku: string; name: string; priceCents: number; stock: number }>>;
}

export interface ContentSource extends BaseAdapter {
  getAssets(sku: string): Promise<Array<{ url: string; alt?: string }>>;
}

export type ShippingQuoteInput = {
  fromCep: string;
  toCep: string;
  insuranceValueCents?: number;
  packages: Array<{
    widthCm: number;
    heightCm: number;
    lengthCm: number;
    weightG: number;
    quantity: number;
  }>;
};

export type ShippingOption = {
  serviceId: string;
  carrier: string;
  name: string;
  priceCents: number;
  etaDays: number;
  etaBusinessDays?: boolean;
  note?: string;
  isStub?: boolean;
};

export interface ShippingProvider extends BaseAdapter {
  quote(input: ShippingQuoteInput): Promise<ShippingOption[]>;
}

export interface PaymentProvider extends BaseAdapter {
  createPreference(input: {
    orderId: string;
    items: Array<{ title: string; quantity: number; unitPriceCents: number }>;
    payer: { email: string; name?: string; phone?: string };
    shippingCostCents?: number;
    preferredPaymentMethod?: "pix" | "credit_card" | "bolbradesco";
  }): Promise<{ initPoint: string; preferenceId: string }>;

  verifyWebhook(
    headers: Record<string, string>,
    rawBody: string,
    dataIdFromUrl?: string | null,
  ): Promise<boolean>;
}
