<?php

declare(strict_types=1);

namespace Generated\Models;

use Generated\Enums\OrderStatus;
use Generated\JsonTypes\OrderRawPayload;
use Generated\JsonTypes\ShippingDetails;
use Polyprism\Runtime\Coerce;

/**
 * A single order. Demonstrates BigInt, Bytes, inline JSON, self-reference,
 * and Float coercion.
 */
final class Order
{
    public string $id;

    /**
     * External order reference from the legacy system — BigInt because
     * the old system's IDs exceed 2^32. Coerce-by-default.
     */
    public int $externalId {
        set(int|string $value) {
            $this->externalId = Coerce::bigint($value, 'Order.externalId');
        }
    }

    public OrderStatus $status = OrderStatus::PENDING;

    public int $totalCents {
        set(int|string $value) {
            $this->totalCents = Coerce::int($value, 'Order.totalCents');
        }
    }

    /**
     * Float coerces by default.
     */
    public float $exchangeRate = 1.0 {
        set(float|int|string $value) {
            $this->exchangeRate = Coerce::float($value, 'Order.exchangeRate');
        }
    }

    /**
     * Bytes is strict — no hook.
     */
    public ?string $receiptBlob = null;

    /**
     * Inline-named JSON shape — emits to JsonTypes/ShippingDetails.php as
     * a `final readonly class`.
     */
    public ShippingDetails $shipping;

    /**
     * Inline-anonymous JSON shape — auto-named OrderRawPayload.
     */
    public ?OrderRawPayload $rawPayload = null;

    public \DateTimeImmutable $placedAt {
        set(\DateTimeImmutable|string|int $value) {
            $this->placedAt = Coerce::date($value, 'Order.placedAt');
        }
    }

    public ?\DateTimeImmutable $shippedAt = null {
        set(\DateTimeImmutable|string|int|null $value) {
            $this->shippedAt = $value === null ? null : Coerce::date($value, 'Order.shippedAt');
        }
    }

    public string $customerId;

    public Customer $customer;

    public ?string $parentOrderId = null;

    public ?Order $parentOrder = null;

    /**
     * @var array<int, Order>
     */
    public array $refunds = [];

    public function __construct(
        string $id,
        int|string $externalId,
        int|string $totalCents,
        ShippingDetails $shipping,
        string $customerId,
        Customer $customer,
        OrderStatus $status = OrderStatus::PENDING,
        float|int|string $exchangeRate = 1.0,
        ?string $receiptBlob = null,
        ?OrderRawPayload $rawPayload = null,
        \DateTimeImmutable|string|int $placedAt = new \DateTimeImmutable(),
        \DateTimeImmutable|string|int|null $shippedAt = null,
        ?string $parentOrderId = null,
        ?Order $parentOrder = null,
        array $refunds = [],
    ) {
        $this->id = $id;
        $this->externalId = $externalId;
        $this->status = $status;
        $this->totalCents = $totalCents;
        $this->exchangeRate = $exchangeRate;
        $this->receiptBlob = $receiptBlob;
        $this->shipping = $shipping;
        $this->rawPayload = $rawPayload;
        $this->placedAt = $placedAt;
        $this->shippedAt = $shippedAt;
        $this->customerId = $customerId;
        $this->customer = $customer;
        $this->parentOrderId = $parentOrderId;
        $this->parentOrder = $parentOrder;
        $this->refunds = $refunds;
    }

    /**
     * Hydrate Order from a Record-like array (e.g. a JSON-decoded
     * request body, a Prisma row, a queue message payload). Routes every
     * field through the constructor so property hooks fire — `@coerce` and
     * `@normalise` rules apply identically to a direct `new Order(...)`
     * call. Included relations are recursively hydrated into their
     * corresponding class instances; already-hydrated instances pass through.
     *
     * **Not a validator.** Required fields missing from `$data` throw
     * `\TypeError` with the field path. Type-mismatched values (e.g. an
     * array for a typed property) propagate as PHP `\TypeError` from the
     * underlying property hook. Pre-validate untrusted input at the boundary
     * (JSON-schema, attribute validation, etc.) if those failure modes need
     * to be caught with richer context.
     *
     * Unknown keys in `$data` are silently dropped.
     *
     * @param array<string, mixed> $data
     */
    public static function from(array $data): self
    {
        $customer = $data['customer'] ?? throw new \TypeError('Order::from(): missing required field "customer"');
        if ($customer !== null && !($customer instanceof Customer)) {
            $customer = Customer::from($customer);
        }
        $parentOrder = $data['parentOrder'] ?? null;
        if ($parentOrder !== null && !($parentOrder instanceof Order)) {
            $parentOrder = Order::from($parentOrder);
        }
        $refunds = $data['refunds'] ?? [];
        if (is_array($refunds)) {
            $refunds = array_map(
                fn($v) => $v instanceof Order ? $v : Order::from($v),
                $refunds,
            );
        }
        return new self(
            id: $data['id'] ?? throw new \TypeError('Order::from(): missing required field "id"'),
            externalId: $data['externalId'] ?? throw new \TypeError('Order::from(): missing required field "externalId"'),
            totalCents: $data['totalCents'] ?? throw new \TypeError('Order::from(): missing required field "totalCents"'),
            shipping: $data['shipping'] ?? throw new \TypeError('Order::from(): missing required field "shipping"'),
            customerId: $data['customerId'] ?? throw new \TypeError('Order::from(): missing required field "customerId"'),
            customer: $customer,
            status: $data['status'] ?? OrderStatus::PENDING,
            exchangeRate: $data['exchangeRate'] ?? 1.0,
            receiptBlob: $data['receiptBlob'] ?? null,
            rawPayload: $data['rawPayload'] ?? null,
            placedAt: $data['placedAt'] ?? new \DateTimeImmutable(),
            shippedAt: $data['shippedAt'] ?? null,
            parentOrderId: $data['parentOrderId'] ?? null,
            parentOrder: $parentOrder,
            refunds: $refunds,
        );
    }
}
