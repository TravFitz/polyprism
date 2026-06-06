<?php

declare(strict_types=1);

// Smoke test for the php-domain-class-showcase generated output.
//
// Goes beyond `php -l` (parse-only) and `composer dump-autoload --strict-psr`
// (file/namespace layout). This script:
//   - Wires Composer's PSR-4 autoloader for both `Generated\` (the showcase
//     output) and `Polyprism\Runtime\` (the property-hook runtime helpers)
//   - Constructs each generated class with realistic mixed-shape input
//   - Verifies @coerce + @normalise fire on the way in
//   - Verifies setter exceptions carry the field path
//   - Exercises json_encode round-trip
//   - Verifies @hide actually drops the field from the constructor signature
//
// Invoked by CI from a throwaway directory that contains:
//   - vendor/ (composer install with the runtime source + showcase autoload)
//   - src/ (the committed showcase output)
//   - runtime/ (the polyprism/runtime source, autoloaded as a dev path repo)
//   - this script copied to scripts/smoke.php alongside src/

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

function expectThrows(string $label, callable $fn, string $expectedSubstring): void
{
    try {
        $fn();
        fwrite(STDERR, "  ✗ {$label}: expected exception, got none\n");
        exit(1);
    } catch (TypeError $e) {
        if (!str_contains($e->getMessage(), $expectedSubstring)) {
            fwrite(STDERR, "  ✗ {$label}: error message {$e->getMessage()} did not contain '{$expectedSubstring}'\n");
            exit(1);
        }
        echo "  ✓ {$label}\n";
    }
}

echo "[1] Enum cases load with the right string backing\n";
check('CustomerTier::PRO->value === "PRO"', CustomerTier::PRO->value === 'PRO');
check('OrderStatus::SHIPPED->value === "SHIPPED"', OrderStatus::SHIPPED->value === 'SHIPPED');

echo "\n[2] Customer constructor coerces stringified numerics + normalises strings\n";
$customer = new Customer(
    id: 'cust_1',
    email: '  ADA@EXAMPLE.COM  ',          // @normalise(trim, lowercase) on the way in
    lifetimeSpendCents: '4250.99',          // string → Coerce::decimal returns string
    loyaltyPoints: '42',                    // string → Coerce::int returns int
    legacyExternalId: '12345',              // String @coerce(int) → int|string accepted
);
check('email normalised', $customer->email === 'ada@example.com');
check('lifetimeSpendCents preserves precision', $customer->lifetimeSpendCents === '4250.99');
check('loyaltyPoints coerced to int', $customer->loyaltyPoints === 42);
check('legacyExternalId coerced via @coerce(int)', (int) $customer->legacyExternalId === 12345);
check('default tier applied', $customer->tier === CustomerTier::FREE);
check('default active applied', $customer->active === true);
check('createdAt defaulted to fresh DateTimeImmutable', $customer->createdAt instanceof DateTimeImmutable);

echo "\n[3] Post-construction assignment also fires hooks (this is the load-bearing PHP 8.4 contract)\n";
$customer->email = '  BOB@example.COM ';
check('post-set email re-normalised', $customer->email === 'bob@example.com');
$customer->loyaltyPoints = '999';
check('post-set loyaltyPoints re-coerced', $customer->loyaltyPoints === 999);

echo "\n[4] Setters throw TypeError with field path on bad input\n";
expectThrows(
    'Int coerce throws on non-numeric string',
    fn () => $customer->loyaltyPoints = 'abc',
    'Cannot coerce "abc" to int for Customer.loyaltyPoints',
);
expectThrows(
    'Decimal coerce throws on non-numeric string',
    fn () => $customer->lifetimeSpendCents = 'xyz',
    'Customer.lifetimeSpendCents',
);

echo "\n[5] @noCoerce keeps the setter strict — passing a string is a type error\n";
expectThrows(
    'internalSeq strict-typed rejects string',
    fn () => $customer->internalSeq = '5',
    'internalSeq',  // PHP's TypeError mentions the property name for type-coercion failures
);

echo "\n[6] nullEmptyToNull converts a blank optional string back to null\n";
$customer->displayName = '   ';
check('nullEmptyToNull applied to whitespace-only', $customer->displayName === null);

echo "\n[7] @hide field is omitted from the constructor signature entirely\n";
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
check('passwordHash (@hide) rejected as named arg', $hideEnforced);

echo "\n[8] JsonType readonly value class composes inside the Order model\n";
$shipping = new ShippingDetails(
    carrier: 'fedex',
    address: ['line1' => '1 Main St', 'city' => 'Sydney', 'country' => 'AU'],
    tags: ['priority'],
    tracking: 'FX-1',
);
$order = new Order(
    id: 'ord_1',
    externalId: '999999999999',  // big int as a string — Coerce::bigint accepts
    totalCents: 12500,
    shipping: $shipping,
    customerId: 'cust_1',
    customer: $customer,
    exchangeRate: '1.25',         // Float coerce-by-default
);
check('externalId BigInt coerced from string', $order->externalId === 999999999999);
check('exchangeRate Float coerced from string', $order->exchangeRate === 1.25);
check('shipping JsonType composed', $order->shipping->carrier === 'fedex');
check('rawPayload nullable defaults to null', $order->rawPayload === null);
check('Order placedAt defaults to fresh DateTimeImmutable', $order->placedAt instanceof DateTimeImmutable);

echo "\n[9] Anonymous JsonType (OrderRawPayload) constructs independently\n";
$payload = new OrderRawPayload(source: 'shopify', raw: ['n' => 1], capturedAt: 1717624800.0);
check('payload->source === "shopify"', $payload->source === 'shopify');

echo "\n[10] json_encode round-trips a fully-hydrated Customer\n";
$encoded = json_encode($customer);
$decoded = json_decode($encoded, true);
check('json_encode produced a string', is_string($encoded));
check('decoded id matches', $decoded['id'] === 'cust_1');
check('decoded email is normalised form', $decoded['email'] === 'bob@example.com');
check('decoded loyaltyPoints is int', $decoded['loyaltyPoints'] === 999);
check('decoded tier value === "FREE"', $decoded['tier'] === 'FREE');
check('@hide passwordHash absent from JSON', !array_key_exists('passwordHash', $decoded));

echo "\n[11] Customer::from(\$array) hydrates through the setter pipeline\n";
$fromCustomer = Customer::from([
    'id' => 'cust_from_1',
    'email' => '  HYDRATED@Example.COM  ',
    'lifetimeSpendCents' => '99.50',
    'loyaltyPoints' => '7',          // string → coerced to int via the hook
    'legacyExternalId' => '12345',   // cross-type @coerce(int) → stored as int
    // displayName, tier, active, createdAt, internalSeq, orders: not provided,
    // should fall through to defaults
]);
check('from() routes string email through @normalise', $fromCustomer->email === 'hydrated@example.com');
check('from() coerces stringified int via property hook', $fromCustomer->loyaltyPoints === 7);
check('from() applies cross-type @coerce(int) storage', (int) $fromCustomer->legacyExternalId === 12345);
check('from() falls through to enum default when key absent', $fromCustomer->tier === CustomerTier::FREE);
check('from() falls through to int 0 default when key absent', $fromCustomer->internalSeq === 0);
check('from() falls through to fresh DateTimeImmutable when key absent', $fromCustomer->createdAt instanceof DateTimeImmutable);
check('from() falls through to empty array for list relation', $fromCustomer->orders === []);

echo "\n[12] Customer::from() throws TypeError with field path on missing required\n";
$missingThrew = false;
try {
    Customer::from(['id' => 'x', 'email' => 'y@z.com']);  // lifetimeSpendCents missing
} catch (TypeError $e) {
    $missingThrew = str_contains($e->getMessage(), 'lifetimeSpendCents');
}
check('from() reports the missing field name in TypeError', $missingThrew);

echo "\n[13] Customer::from() silently drops unknown keys\n";
$withExtra = Customer::from([
    'id' => 'cust_extra',
    'email' => 'a@b.com',
    'lifetimeSpendCents' => '0',
    'wHaTeVer' => 'ignored',           // not a real field
    'passwordHash' => 'leaked?',       // @hide field — must not appear on instance
]);
check('unknown key did not break construction', $withExtra->id === 'cust_extra');
$encoded2 = json_encode($withExtra);
$decoded2 = json_decode($encoded2, true);
check('@hide passwordHash absent from from()-hydrated instance', !array_key_exists('passwordHash', $decoded2));

echo "\nAll smoke checks passed.\n";
