<?php

declare(strict_types=1);

namespace Polyprism\Runtime\Tests;

use DateTimeImmutable;
use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Polyprism\Runtime\Coerce;
use TypeError;

#[CoversClass(Coerce::class)]
final class CoerceTest extends TestCase
{
    // ---------- int ----------

    public function testIntPassesThroughIntegers(): void
    {
        $this->assertSame(42, Coerce::int(42, 'M.f'));
        $this->assertSame(0, Coerce::int(0, 'M.f'));
        $this->assertSame(-7, Coerce::int(-7, 'M.f'));
    }

    public function testIntParsesNumericStrings(): void
    {
        $this->assertSame(42, Coerce::int('42', 'M.f'));
        $this->assertSame(-7, Coerce::int('-7', 'M.f'));
        $this->assertSame(0, Coerce::int('0', 'M.f'));
    }

    /** @return list<array{string}> */
    public static function intRejectCases(): array
    {
        return [
            ['1.5'],          // fractional string
            ['1.0'],          // even ".0" is a float-shaped string
            ['abc'],
            [''],
            ['   '],
            ['1e10'],         // scientific notation isn't a clean int
            ['99999999999999999999'], // overflow beyond PHP_INT_MAX
        ];
    }

    public function testIntAcceptsSurroundingWhitespaceOnNumericString(): void
    {
        // Matches the JS coerceInt contract: `Number(' 1 ')` returns 1, which
        // Number.isInteger accepts. Mirroring that behaviour here keeps PHP
        // and TS domain-class setters reading the same payloads identically.
        $this->assertSame(1, Coerce::int(' 1 ', 'M.f'));
    }

    #[DataProvider('intRejectCases')]
    public function testIntRejectsInvalidStrings(string $bad): void
    {
        $this->expectException(TypeError::class);
        $this->expectExceptionMessage('to int for User.points');
        Coerce::int($bad, 'User.points');
    }

    public function testIntErrorMessageQuotesTheBadValue(): void
    {
        try {
            Coerce::int('abc', 'User.points');
            $this->fail('expected TypeError');
        } catch (TypeError $e) {
            $this->assertSame('Cannot coerce "abc" to int for User.points', $e->getMessage());
        }
    }

    // ---------- float ----------

    public function testFloatPassesThroughFloats(): void
    {
        $this->assertSame(1.5, Coerce::float(1.5, 'M.f'));
        $this->assertSame(0.0, Coerce::float(0.0, 'M.f'));
    }

    public function testFloatWidensInts(): void
    {
        $this->assertSame(42.0, Coerce::float(42, 'M.f'));
    }

    public function testFloatParsesNumericStrings(): void
    {
        $this->assertSame(1.5, Coerce::float('1.5', 'M.f'));
        $this->assertSame(42.0, Coerce::float('42', 'M.f'));
        $this->assertSame(-0.25, Coerce::float('-0.25', 'M.f'));
    }

    /** @return list<array{string}> */
    public static function floatRejectStringCases(): array
    {
        return [
            ['5.5abc'],     // lenient prefix parser would accept; we must not
            ['abc'],
            [''],
            ['   '],
        ];
    }

    #[DataProvider('floatRejectStringCases')]
    public function testFloatRejectsInvalidStrings(string $bad): void
    {
        $this->expectException(TypeError::class);
        Coerce::float($bad, 'Order.rate');
    }

    public function testFloatRejectsInfinity(): void
    {
        $this->expectException(TypeError::class);
        Coerce::float(INF, 'Order.rate');
    }

    public function testFloatRejectsNaN(): void
    {
        $this->expectException(TypeError::class);
        Coerce::float(NAN, 'Order.rate');
    }

    // ---------- bigint ----------

    public function testBigintPassesThroughInts(): void
    {
        $this->assertSame(9223372036854775807, Coerce::bigint(PHP_INT_MAX, 'M.f'));
    }

    public function testBigintParsesNumericStrings(): void
    {
        $this->assertSame(42, Coerce::bigint('42', 'M.f'));
        $this->assertSame(-7, Coerce::bigint('-7', 'M.f'));
    }

    /** @return list<array{string}> */
    public static function bigintRejectCases(): array
    {
        return [
            ['99999999999999999999'],  // overflow beyond PHP_INT_MAX
            ['1.5'],
            ['abc'],
            [''],
            ['   '],
        ];
    }

    #[DataProvider('bigintRejectCases')]
    public function testBigintRejectsInvalidStrings(string $bad): void
    {
        $this->expectException(TypeError::class);
        Coerce::bigint($bad, 'Order.externalId');
    }

    // ---------- date ----------

    public function testDatePassesThroughDateTimeImmutable(): void
    {
        $d = new DateTimeImmutable('2026-01-01');
        $this->assertSame($d, Coerce::date($d, 'M.f'));
    }

    public function testDateParsesIsoString(): void
    {
        $d = Coerce::date('2026-06-06T12:00:00Z', 'M.f');
        $this->assertSame('2026-06-06T12:00:00+00:00', $d->format('c'));
    }

    public function testDateTreatsIntAsUnixTimestamp(): void
    {
        $d = Coerce::date(0, 'M.f');
        $this->assertSame('1970-01-01T00:00:00+00:00', $d->format('c'));
    }

    public function testDateRejectsInvalidString(): void
    {
        $this->expectException(TypeError::class);
        $this->expectExceptionMessage('to DateTime for Event.at');
        Coerce::date('not a date', 'Event.at');
    }

    public function testDateRejectsEmptyString(): void
    {
        $this->expectException(TypeError::class);
        Coerce::date('', 'Event.at');
    }

    // ---------- decimal ----------

    public function testDecimalPassesThroughStrings(): void
    {
        $this->assertSame('1.5', Coerce::decimal('1.5', 'M.f'));
        $this->assertSame('123456789.987654321', Coerce::decimal('123456789.987654321', 'M.f'));
        $this->assertSame('-42', Coerce::decimal('-42', 'M.f'));
    }

    public function testDecimalStringifiesInts(): void
    {
        $this->assertSame('42', Coerce::decimal(42, 'M.f'));
        $this->assertSame('0', Coerce::decimal(0, 'M.f'));
    }

    public function testDecimalStringifiesFloats(): void
    {
        // Round-trip precision: not %g which would truncate to 6 sigfigs.
        $this->assertSame('1.5', Coerce::decimal(1.5, 'M.f'));
    }

    public function testDecimalRejectsNonNumericString(): void
    {
        $this->expectException(TypeError::class);
        $this->expectExceptionMessage('to decimal for Order.amount');
        Coerce::decimal('abc', 'Order.amount');
    }

    public function testDecimalRejectsEmptyString(): void
    {
        $this->expectException(TypeError::class);
        Coerce::decimal('', 'Order.amount');
    }

    public function testDecimalRejectsInfinity(): void
    {
        $this->expectException(TypeError::class);
        Coerce::decimal(INF, 'Order.amount');
    }
}
