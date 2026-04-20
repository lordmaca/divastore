import { tiny } from "./tiny/client";
import { mercadoPago } from "./mp/client";
import { divahub } from "./divahub/client";
import { melhorEnvio } from "./shipping/melhorenvio/provider";
import type { BaseAdapter } from "./types";

export const adapters: Record<string, BaseAdapter> = {
  tiny,
  mercadopago: mercadoPago,
  divahub,
  melhorenvio: melhorEnvio,
};
