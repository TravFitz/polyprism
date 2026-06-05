<?php

declare(strict_types=1);

namespace Generated\JsonTypes;

/**
 * Generated value object for a Prisma Json field. Construct from a decoded JSON payload — e.g. `new OrderRawPayload(...$payload)` or by explicit named arguments.
 */
final readonly class OrderRawPayload
{
    public function __construct(
        public string $source,
        public mixed $raw,
        public float $capturedAt,
    ) {}
}
