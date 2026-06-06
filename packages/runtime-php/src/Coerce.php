<?php

declare(strict_types=1);

namespace Polyprism\Runtime;

use DateTimeImmutable;
use Exception;
use TypeError;

/**
 * Coercion primitives used by domain-class property-hook setters for the
 * default-coerce scalar types (Int / Float / BigInt / Decimal / DateTime).
 *
 * Every method:
 *   - accepts a widened input type matching the JS runtime's contract
 *   - returns the canonical PHP type
 *   - throws TypeError with the field path in the message on invalid input
 *
 * The field path is passed in by the generated setter so error messages
 * pinpoint exactly where the coercion failed:
 *
 *     TypeError: Cannot coerce "abc" to int for User.points
 *
 * Mirrors @polyprism/runtime (the npm package) for the TS domain-class side
 * — same five types, same throw-on-invalid contract, same field-path-in-
 * message format. The PHP version is a separate package on Packagist
 * (`polyprism/runtime`) so the npm package doesn't have to ship PHP source.
 */
final class Coerce
{
    /**
     * Coerce int|string → int. Throws on non-integer strings, empty/whitespace
     * strings, fractional values, and overflows beyond PHP_INT_MAX.
     *
     * "Int" means int — a fractional input (whether `1.5` the number or
     * `"1.5"` the string) is a caller bug, not data to silently truncate. We
     * reject both paths symmetrically so the contract reads the same
     * regardless of input shape.
     *
     * `filter_var(..., FILTER_VALIDATE_INT)` is the load-bearing primitive:
     * it returns the int on success, `false` on anything that isn't a clean
     * decimal-integer string (fractional, scientific notation, alphabetic,
     * overflow beyond PHP_INT_MAX, leading/trailing whitespace, empty).
     * That single check covers every reject case for the string path.
     */
    public static function int(int|string $value, string $fieldPath): int
    {
        if (is_int($value)) {
            return $value;
        }
        // Reject empty + whitespace before delegating — filter_var rejects
        // empty already, but the explicit guard keeps the failure message
        // honest for "  " (which filter_var ALSO rejects, just less obviously).
        if (trim($value) === '') {
            throw new TypeError(self::formatError($value, 'int', $fieldPath));
        }
        $next = filter_var($value, FILTER_VALIDATE_INT);
        if ($next === false) {
            throw new TypeError(self::formatError($value, 'int', $fieldPath));
        }
        return $next;
    }

    /**
     * Coerce float|int|string → float. Throws on non-finite results AND on
     * strings that don't fully match a numeric shape.
     *
     * We use `filter_var(..., FILTER_VALIDATE_FLOAT)` instead of `(float)`
     * casting because `(float) "5.5abc"` silently returns `5.5` (lenient
     * prefix parser). For a setter accepting `"amount" → Float`, that means
     * a malformed boundary payload stores partial data instead of throwing.
     * `FILTER_VALIDATE_FLOAT` returns false for any trailing garbage.
     *
     * The empty-string guard mirrors `int()`'s: an empty/whitespace input
     * is semantically not a float, even though `(float) ""` would return 0.0.
     */
    public static function float(float|int|string $value, string $fieldPath): float
    {
        if (is_float($value)) {
            if (!is_finite($value)) {
                throw new TypeError(self::formatError($value, 'float', $fieldPath));
            }
            return $value;
        }
        if (is_int($value)) {
            return (float) $value;
        }
        if (trim($value) === '') {
            throw new TypeError(self::formatError($value, 'float', $fieldPath));
        }
        $next = filter_var($value, FILTER_VALIDATE_FLOAT);
        if ($next === false || !is_finite($next)) {
            throw new TypeError(self::formatError($value, 'float', $fieldPath));
        }
        return $next;
    }

    /**
     * Coerce int|string → int (the PHP equivalent of bigint). On 64-bit PHP,
     * `int` is signed 64-bit — same width as TS `bigint` callers most often
     * use. Strings outside `[PHP_INT_MIN, PHP_INT_MAX]` are rejected rather
     * than silently truncated.
     *
     * If a caller needs arbitrary-precision integers (beyond 64-bit), they
     * should annotate the field with `@type` to override to a userland
     * BigInteger class — that escape hatch already exists in php-shared.
     */
    public static function bigint(int|string $value, string $fieldPath): int
    {
        if (is_int($value)) {
            return $value;
        }
        if (trim($value) === '') {
            throw new TypeError(self::formatError($value, 'bigint', $fieldPath));
        }
        // FILTER_VALIDATE_INT rejects values outside PHP_INT_MAX / PHP_INT_MIN
        // by returning false, so the overflow case is covered by the same check
        // that rejects fractional / alphabetic input.
        $next = filter_var($value, FILTER_VALIDATE_INT);
        if ($next === false) {
            throw new TypeError(self::formatError($value, 'bigint', $fieldPath));
        }
        return $next;
    }

    /**
     * Coerce DateTimeImmutable|string|int → DateTimeImmutable.
     *
     * Strings flow through `new DateTimeImmutable($value)` which accepts
     * ISO 8601, RFC 2822, and PHP's "any English textual datetime" shapes.
     * Numeric inputs are treated as Unix timestamps (seconds since epoch).
     * Invalid strings throw `Exception` from the constructor; we rewrap as
     * TypeError to give callers a single exception type to catch.
     */
    public static function date(DateTimeImmutable|string|int $value, string $fieldPath): DateTimeImmutable
    {
        if ($value instanceof DateTimeImmutable) {
            return $value;
        }
        if (is_int($value)) {
            // The `@` prefix tells DateTimeImmutable to treat the value as a
            // Unix timestamp. Always succeeds — there's no invalid int.
            return new DateTimeImmutable('@' . $value);
        }
        if (trim($value) === '') {
            throw new TypeError(self::formatError($value, 'DateTime', $fieldPath));
        }
        try {
            return new DateTimeImmutable($value);
        } catch (Exception) {
            throw new TypeError(self::formatError($value, 'DateTime', $fieldPath));
        }
    }

    /**
     * Coerce string|float|int → canonical decimal string.
     *
     * PHP has no native arbitrary-precision decimal type, so PolyPrism maps
     * Prisma `Decimal` to `string` on the PHP side (consistent with the
     * php-class / php-readonly mapping). This method validates that the
     * input is numerically shaped and returns it as a string — preserving
     * the caller's precision rather than round-tripping through `float`.
     *
     * Floats round-trip through PHP's serialiser (`serialize_precision`),
     * which is lossy for many decimal fractions (`0.1 + 0.2 !== 0.3`). For
     * float inputs we use `sprintf('%.17g')` which preserves the IEEE-754
     * representation exactly. If a caller wants exact decimal precision
     * end-to-end, they should pass a string from the boundary.
     */
    public static function decimal(string|float|int $value, string $fieldPath): string
    {
        if (is_int($value)) {
            return (string) $value;
        }
        if (is_float($value)) {
            if (!is_finite($value)) {
                throw new TypeError(self::formatError($value, 'decimal', $fieldPath));
            }
            // %.17g preserves IEEE-754 round-trip precision; %g (default 6
            // sigfigs) silently truncates `0.123456789` to `0.123457`.
            return sprintf('%.17g', $value);
        }
        if (trim($value) === '') {
            throw new TypeError(self::formatError($value, 'decimal', $fieldPath));
        }
        if (!is_numeric($value)) {
            throw new TypeError(self::formatError($value, 'decimal', $fieldPath));
        }
        return $value;
    }

    private static function formatError(mixed $value, string $target, string $fieldPath): string
    {
        // Stringify the value the same way JSON.stringify would, so the
        // PHP error messages line up with the JS runtime's:
        //   - strings get JSON-quoted
        //   - numbers stay as numbers
        //   - everything else falls through to PHP's var_export shape
        if (is_string($value)) {
            $encoded = json_encode($value, JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
        } elseif (is_int($value) || is_float($value)) {
            $encoded = (string) $value;
        } else {
            $encoded = var_export($value, true);
        }
        return "Cannot coerce {$encoded} to {$target} for {$fieldPath}";
    }
}
