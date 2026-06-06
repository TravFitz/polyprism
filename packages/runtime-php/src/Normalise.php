<?php

declare(strict_types=1);

namespace Polyprism\Runtime;

/**
 * String-normalisation primitives used by domain-class property-hook setters.
 *
 * Ops are applied in declared order — `[TRIM, LOWERCASE]` and `[LOWERCASE,
 * TRIM]` are not generally equivalent for inputs with leading/trailing
 * whitespace mixed with upper-case (in practice, the user picks the order
 * they want).
 *
 * The op identifiers are exported as class constants so generated PHP can
 * reference them by symbol (`Normalise::TRIM`) rather than string literal —
 * a typo in a generated `'trim'` would silently no-op, whereas a typo in
 * `Normalise::TROM` is a compile-time error.
 *
 * Mirrors @polyprism/runtime's normalise.ts (the npm runtime); same op set,
 * same nullable contract, same in-order application.
 */
final class Normalise
{
    public const string TRIM = 'trim';
    public const string LOWERCASE = 'lowercase';
    public const string UPPERCASE = 'uppercase';
    public const string NULL_EMPTY_TO_NULL = 'nullEmptyToNull';

    /**
     * Apply normalise ops in order to a non-nullable string field's input.
     *
     * `NULL_EMPTY_TO_NULL` is silently ignored here — it's only meaningful
     * on nullable fields, and the emit-time validator rejects it on
     * non-nullable fields before we ever reach this runtime path. The
     * runtime treats it as a no-op for defensive belt-and-braces (an
     * emitter bug shouldn't crash a production app).
     *
     * @param list<string> $ops
     */
    public static function apply(string $value, array $ops): string
    {
        $next = $value;
        foreach ($ops as $op) {
            if ($op === self::TRIM) {
                $next = trim($next);
            } elseif ($op === self::LOWERCASE) {
                $next = strtolower($next);
            } elseif ($op === self::UPPERCASE) {
                $next = strtoupper($next);
            }
            // NULL_EMPTY_TO_NULL intentionally a no-op on the non-nullable path.
        }
        return $next;
    }

    /**
     * Apply normalise ops to a nullable string field's input.
     *
     * The `NULL_EMPTY_TO_NULL` op only fires here, since the result type
     * widens to `?string`. Once the value becomes `null`, subsequent ops
     * are short-circuited (you can't `trim()` null).
     *
     * @param list<string> $ops
     */
    public static function applyNullable(?string $value, array $ops): ?string
    {
        $next = $value;
        foreach ($ops as $op) {
            if ($next === null) {
                break;
            }
            if ($op === self::TRIM) {
                $next = trim($next);
            } elseif ($op === self::LOWERCASE) {
                $next = strtolower($next);
            } elseif ($op === self::UPPERCASE) {
                $next = strtoupper($next);
            } elseif ($op === self::NULL_EMPTY_TO_NULL && $next === '') {
                $next = null;
            }
        }
        return $next;
    }
}
