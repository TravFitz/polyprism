<?php

declare(strict_types=1);

namespace Generated\Models;

use Generated\Enums\OrderStatus;

/**
 * A single order placed by a customer. Demonstrates the self-reference
 * pattern (a refunded order points back at its parent), every default
 * shape, and BigInt for the external-system ID.
 */
final class Order
{
    public function __construct(
        public string $id,
        /**
         * External order reference from the legacy system — BigInt because
         * the old system's IDs exceed 2^32.
         */
        public int $externalId,
        /**
         * Total in the currency's smallest unit (cents).
         */
        public int $totalCents,
        public string $customerId,
        public Customer $customer,
        public OrderStatus $status = OrderStatus::PENDING,
        /**
         * Exchange rate used at the time of order — Float because precision
         * beyond 6 places isn't required and float arithmetic is faster
         * than Decimal for downstream calculations.
         */
        public float $exchangeRate = 1.0,
        /**
         * Customer-facing notes; bytes column so the renderer covers the
         * binary-data path even though most real systems would use String.
         */
        public ?string $receiptBlob = null,
        /**
         * Free-form JSON payload from the upstream API. Falls back to `mixed`.
         */
        public mixed $rawPayload = null,
        public \DateTimeImmutable $placedAt = new \DateTimeImmutable(),
        public ?\DateTimeImmutable $shippedAt = null,
        public ?string $parentOrderId = null,
        public ?Order $parentOrder = null,
        /**
         * @var array<int, Order>
         */
        public array $refunds = [],
    ) {}
}
