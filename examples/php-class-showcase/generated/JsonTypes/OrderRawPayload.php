<?php

declare(strict_types=1);

namespace Generated\JsonTypes;

/**
 * Generated value object for a Prisma Json field. Construct from a decoded JSON payload — e.g. `new OrderRawPayload(...$payload)` or by explicit named arguments.
 */
final class OrderRawPayload
{
    public function __construct(
        public readonly string $source,
        public readonly mixed $raw,
        public readonly float $capturedAt,
    ) {}
}
