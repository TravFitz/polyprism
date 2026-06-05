<?php

declare(strict_types=1);

// Smoke test for the php-class-showcase generated output.
//
// Goes beyond `php -l` (parse-only) and `composer dump-autoload --strict-psr`
// (file/namespace layout). This script:
//   - Wires Composer's PSR-4 autoloader at <project>/vendor/autoload.php
//   - Instantiates every generated class with realistic named arguments
//   - Exercises `final readonly` enforcement (assignment must throw)
//   - Verifies `@hide` actually omits the field (passing the hidden arg
//     must throw "Unknown named parameter")
//   - Exercises `json_encode` round-trip on the public-property shape
//
// Invoked by CI from a throwaway directory that contains:
//   - vendor/ (composer install with the showcase autoload mapping)
//   - src/ (the committed showcase output)
//   - this script copied to scripts/smoke.php alongside src/
// Exit 0 on every assertion passing; exit 1 (with explanatory message) otherwise.

require __DIR__ . '/../vendor/autoload.php';

use Generated\Enums\CustomerTier;
use Generated\Enums\OrderStatus;
use Generated\JsonTypes\OrderRawPayload;
use Generated\JsonTypes\ShippingDetails;
use Generated\Models\Customer;
use Generated\Models\Order;

function check(string $label, bool $ok, string $detail = ''): void
{
    if ($ok) {
        echo "  ✓ {$label}\n";
        return;
    }
    fwrite(STDERR, "  ✗ {$label}" . ($detail !== '' ? ": {$detail}" : '') . "\n");
    exit(1);
}

echo "[1] Enum cases load and their string backing matches\n";
check('CustomerTier::PRO->value === "PRO"', CustomerTier::PRO->value === 'PRO');
check('OrderStatus::SHIPPED->value === "SHIPPED"', OrderStatus::SHIPPED->value === 'SHIPPED');

echo "\n[2] JsonType readonly value class constructs from named arguments\n";
$shipping = new ShippingDetails(
    carrier: 'fedex',
    address: ['line1' => '1 Main St', 'city' => 'Sydney', 'country' => 'AU'],
    tags: ['priority', 'next-day'],
    tracking: 'FX-12345',
);
check('shipping->carrier === "fedex"', $shipping->carrier === 'fedex');
check('shipping->tracking === "FX-12345"', $shipping->tracking === 'FX-12345');
check('shipping->tags[0] === "priority"', $shipping->tags[0] === 'priority');

echo "\n[3] Readonly enforcement throws on assignment after construction\n";
$readonlyThrew = false;
try {
    $shipping->carrier = 'dhl';
} catch (Error $e) {
    $readonlyThrew = str_contains($e->getMessage(), 'readonly');
}
check('readonly assignment throws Error with "readonly" in message', $readonlyThrew);

echo "\n[4] Mutable parent (Customer / php-class) allows reassignment\n";
$customer = new Customer(
    id: 'cust_1',
    email: 'a@b.com',
    lifetimeSpendCents: '4250',
);
$customer->email = 'changed@b.com';
check('mutable email reassignment succeeds', $customer->email === 'changed@b.com');

echo "\n[5] @hide field is omitted from the constructor signature\n";
$hideEnforced = false;
try {
    new Customer(
        id: 'cust_2',
        email: 'x@y.com',
        lifetimeSpendCents: '0',
        passwordHash: 'secret',
    );
} catch (Error $e) {
    $hideEnforced = str_contains($e->getMessage(), 'passwordHash');
}
check('passwordHash (@hide) not accepted as named arg', $hideEnforced);

echo "\n[6] Order with required JsonType + optional anonymous JsonType\n";
$order = new Order(
    id: 'ord_1',
    externalId: 999999999,
    totalCents: 12500,
    shipping: $shipping,
    customerId: 'cust_1',
    customer: $customer,
);
check('order->id === "ord_1"', $order->id === 'ord_1');
check('order->shipping->carrier === "fedex"', $order->shipping->carrier === 'fedex');
check('rawPayload defaults to null', $order->rawPayload === null);
check('placedAt is DateTimeImmutable', $order->placedAt instanceof DateTimeImmutable);

echo "\n[7] Anonymous JsonType (OrderRawPayload) constructs and is assignable\n";
$payload = new OrderRawPayload(source: 'shopify', raw: ['data' => 1], capturedAt: 1717624800.0);
check('payload->source === "shopify"', $payload->source === 'shopify');
check('payload->raw is array', is_array($payload->raw));

echo "\n[8] json_encode round-trips public typed properties\n";
$encoded = json_encode($customer);
$decoded = json_decode($encoded, true);
check('json_encode produced a string', is_string($encoded));
check('decoded id === "cust_1"', $decoded['id'] === 'cust_1');
check('decoded tier === "FREE" (enum value)', $decoded['tier'] === 'FREE');
check('decoded orders is array', is_array($decoded['orders']));

echo "\nAll smoke checks passed.\n";
