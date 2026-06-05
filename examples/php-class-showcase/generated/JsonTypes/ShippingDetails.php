<?php

declare(strict_types=1);

namespace Generated\JsonTypes;

/**
 * Generated value object for a Prisma Json field. Construct from a decoded JSON payload — e.g. `new ShippingDetails(...$payload)` or by explicit named arguments.
 */
final readonly class ShippingDetails
{
    public function __construct(
        public string $carrier,
        /**
         * @var array{line1: string, line2?: string, city: string, country: string}
         */
        public array $address,
        /**
         * @var array<int, string>
         */
        public array $tags,
        public ?string $tracking = null,
    ) {}
}
