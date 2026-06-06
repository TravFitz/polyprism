<?php

declare(strict_types=1);

namespace Generated\Models;

use Generated\Enums\CustomerTier;
use Polyprism\Runtime\Coerce;
use Polyprism\Runtime\Normalise;

/**
 * A customer in the billing system. Exercises every default-coerce target
 * plus the @normalise op set on String fields.
 */
final class Customer
{
    public string $id;

    /**
     * Trimmed + lowercased on assignment. The classic email-normalisation
     * shape that ts-domain-class exists to support.
     */
    public string $email {
        set(string $value) {
            $this->email = Normalise::apply($value, [Normalise::TRIM, Normalise::LOWERCASE]);
        }
    }

    /**
     * Optional display name with whitespace-only-becomes-null.
     */
    public ?string $displayName = null {
        set(?string $value) {
            $this->displayName = Normalise::applyNullable($value, [Normalise::TRIM, Normalise::NULL_EMPTY_TO_NULL]);
        }
    }

    public CustomerTier $tier = CustomerTier::FREE;

    /**
     * Coerce-by-default Decimal — accepts `string|float|int`, stores `string`.
     */
    public string $lifetimeSpendCents {
        set(string|float|int $value) {
            $this->lifetimeSpendCents = Coerce::decimal($value, 'Customer.lifetimeSpendCents');
        }
    }

    /**
     * Coerce-by-default Int — accepts `int|string`, stores `int`.
     */
    public int $loyaltyPoints = 0 {
        set(int|string $value) {
            $this->loyaltyPoints = Coerce::int($value, 'Customer.loyaltyPoints');
        }
    }

    /**
     * Strict by default — Boolean has no sane string→bool coercion.
     */
    public bool $active = true;

    /**
     * Coerce-by-default DateTime.
     */
    public \DateTimeImmutable $createdAt {
        set(\DateTimeImmutable|string|int $value) {
            $this->createdAt = Coerce::date($value, 'Customer.createdAt');
        }
    }

    /**
     * Legacy string column promoted to int via cross-type @coerce.
     * Setter accepts `int|string`; storage is `int`.
     */
    public ?int $legacyExternalId = null {
        set(int|string|null $value) {
            $this->legacyExternalId = $value === null ? null : Coerce::int($value, 'Customer.legacyExternalId');
        }
    }

    /**
     * Strict-by-default Int — @noCoerce keeps the setter type narrow.
     */
    public int $internalSeq = 0;

    /**
     * @var array<int, Order>
     */
    public array $orders = [];

    public function __construct(
        string $id,
        string $email,
        string|float|int $lifetimeSpendCents,
        ?string $displayName = null,
        CustomerTier $tier = CustomerTier::FREE,
        int|string $loyaltyPoints = 0,
        bool $active = true,
        \DateTimeImmutable|string|int $createdAt = new \DateTimeImmutable(),
        int|string|null $legacyExternalId = null,
        int $internalSeq = 0,
        array $orders = [],
    ) {
        $this->id = $id;
        $this->email = $email;
        $this->displayName = $displayName;
        $this->tier = $tier;
        $this->lifetimeSpendCents = $lifetimeSpendCents;
        $this->loyaltyPoints = $loyaltyPoints;
        $this->active = $active;
        $this->createdAt = $createdAt;
        $this->legacyExternalId = $legacyExternalId;
        $this->internalSeq = $internalSeq;
        $this->orders = $orders;
    }

    /**
     * Hydrate Customer from a Record-like array (e.g. a JSON-decoded
     * request body, a Prisma row, a queue message payload). Routes every
     * field through the constructor so property hooks fire — `@coerce` and
     * `@normalise` rules apply identically to a direct `new Customer(...)`
     * call.
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
        return new self(
            id: $data['id'] ?? throw new \TypeError('Customer::from(): missing required field "id"'),
            email: $data['email'] ?? throw new \TypeError('Customer::from(): missing required field "email"'),
            lifetimeSpendCents: $data['lifetimeSpendCents'] ?? throw new \TypeError('Customer::from(): missing required field "lifetimeSpendCents"'),
            displayName: $data['displayName'] ?? null,
            tier: $data['tier'] ?? CustomerTier::FREE,
            loyaltyPoints: $data['loyaltyPoints'] ?? 0,
            active: $data['active'] ?? true,
            createdAt: $data['createdAt'] ?? new \DateTimeImmutable(),
            legacyExternalId: $data['legacyExternalId'] ?? null,
            internalSeq: $data['internalSeq'] ?? 0,
            orders: $data['orders'] ?? [],
        );
    }
}
