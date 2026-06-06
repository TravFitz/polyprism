<?php

declare(strict_types=1);

namespace Generated\JsonTypes;

/**
 * Generated value object for a Prisma Json field. Construct from a decoded JSON payload — e.g. `new ShippingDetails(...$payload)` or by explicit named arguments.
 */
final class ShippingDetails
{
    public function __construct(
        public readonly string $carrier,
        /**
         * @var array{line1: string, line2?: string, city: string, country: string}
         */
        public readonly array $address,
        /**
         * @var array<int, string>
         */
        public readonly array $tags,
        public readonly ?string $tracking = null,
    ) {}
}
