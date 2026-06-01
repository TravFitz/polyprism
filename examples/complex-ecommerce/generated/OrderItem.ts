import type { Decimal } from "@prisma/client/runtime/library";
import type { LineItemSnapshot } from "./json-types/LineItemSnapshot.js";
import type { Order } from "./Order.js";
import type { Product } from "./Product.js";

export interface OrderItem {
  id: bigint;
  orderId: bigint;
  order: Order;
  productId: string;
  product: Product;
  quantity: number;
  /**
   * @db.Decimal(15, 2)
   */
  unitPrice: Decimal;
  snapshot: LineItemSnapshot;
}
