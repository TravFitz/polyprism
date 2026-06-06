<?php

declare(strict_types=1);

namespace Generated\Models;

use Generated\Enums\CustomerTier;

/**
 * A customer in the billing system. Demonstrates every supported scalar
 * type, plus enum defaults, optional fields, and a one-to-many relation
 * out to orders.
 */
final class Customer
{
    public function __construct(
        public string $id,
        public string $email,
        /**
         * Lifetime spend in cents — kept as Decimal to preserve currency
         * precision across rate-conversion rounds. No PHP-emittable default
         * (Decimal defaults are deferred to a future renderer pass), so this
         * becomes a required constructor argument.
         */
        public string $lifetimeSpendCents,
        /**
         * Free-form display name. Optional because some flows create
         * customers from email-only signups.
         */
        public ?string $displayName = null,
        public CustomerTier $tier = CustomerTier::FREE,
        /**
         * Loyalty points; the trivial Int default exercises the literal path.
         */
        public int $loyaltyPoints = 0,
        public bool $active = true,
        public \DateTimeImmutable $createdAt = new \DateTimeImmutable(),
        /**
         * @var array<int, Order>
         */
        public array $orders = [],
    ) {}
}
