import type { Decimal } from "@prisma/client/runtime/library";
import type { ProductCategory } from "./enums/ProductCategory.js";
import type { OrderItem } from "./OrderItem.js";
import type { BrandedSku } from "./types/brand";
import type { ProductAttributes } from "./types/product-attributes";

export interface Product {
  id: string;
  sku: string;
  name: string;
  description: string | null;
  /**
   * @db.Decimal(15, 2)
   */
  price: Decimal;
  stockQuantity: number;
  attributes: ProductAttributes;
  seoMeta: SeoMeta | null;
  internalSku: BrandedSku | null;
  category: ProductCategory;
  parentId: string | null;
  parent: Product | null;
  variants: Product[];
  orderItems: OrderItem[];
  /**
   * @deprecated
   */
  oldSkuCode: string | null;
  createdAt: Date;
  updatedAt: Date;
}
