// Inbound DivaHub payload schemas. The single source of truth lives in
// lib/product-schema.ts so admin CRUD and DivaHub upserts validate identically.
export {
  slugSchema,
  skuSchema,
  variantInput,
  imageInput,
  videoInput,
  categoryInput,
  productInput,
  productBatchInput,
  type ProductInput,
  type ProductBatchInput,
  type VariantInput,
  type CategoryInput,
  type VideoInput,
} from "@/lib/product-schema";
