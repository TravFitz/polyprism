<?php

declare(strict_types=1);

namespace Polyprism\Runtime\Tests;

use PHPUnit\Framework\Attributes\CoversClass;
use PHPUnit\Framework\TestCase;
use Polyprism\Runtime\Normalise;

#[CoversClass(Normalise::class)]
final class NormaliseTest extends TestCase
{
    // ---------- apply (non-nullable) ----------

    public function testApplyWithNoOpsReturnsInputUnchanged(): void
    {
        $this->assertSame('  Hello  ', Normalise::apply('  Hello  ', []));
    }

    public function testApplyTrim(): void
    {
        $this->assertSame('Hello', Normalise::apply('  Hello  ', [Normalise::TRIM]));
    }

    public function testApplyLowercase(): void
    {
        $this->assertSame('hello', Normalise::apply('HELLO', [Normalise::LOWERCASE]));
    }

    public function testApplyUppercase(): void
    {
        $this->assertSame('HELLO', Normalise::apply('hello', [Normalise::UPPERCASE]));
    }

    public function testApplyMultipleOpsInOrder(): void
    {
        $this->assertSame('hello', Normalise::apply('  HELLO  ', [Normalise::TRIM, Normalise::LOWERCASE]));
    }

    public function testApplyOrderMatters(): void
    {
        // trim-then-uppercase vs uppercase-then-trim — both produce the same
        // result for whitespace-only padding, but the order is preserved.
        $a = Normalise::apply('  hi  ', [Normalise::TRIM, Normalise::UPPERCASE]);
        $b = Normalise::apply('  hi  ', [Normalise::UPPERCASE, Normalise::TRIM]);
        $this->assertSame('HI', $a);
        $this->assertSame('HI', $b);
    }

    public function testApplyIgnoresNullEmptyToNullOnNonNullablePath(): void
    {
        $this->assertSame('', Normalise::apply('', [Normalise::NULL_EMPTY_TO_NULL]));
    }

    // ---------- applyNullable ----------

    public function testApplyNullablePassesThroughNull(): void
    {
        $this->assertNull(Normalise::applyNullable(null, [Normalise::TRIM, Normalise::LOWERCASE]));
    }

    public function testApplyNullableConvertsEmptyToNull(): void
    {
        $this->assertNull(Normalise::applyNullable('', [Normalise::NULL_EMPTY_TO_NULL]));
    }

    public function testApplyNullableConvertsTrimmedEmptyToNull(): void
    {
        $this->assertNull(
            Normalise::applyNullable('   ', [Normalise::TRIM, Normalise::NULL_EMPTY_TO_NULL]),
        );
    }

    public function testApplyNullableShortCircuitsAfterNullConversion(): void
    {
        // Once nullEmptyToNull produces null, subsequent uppercase op must
        // not error trying to call strtoupper on null.
        $result = Normalise::applyNullable(
            '',
            [Normalise::NULL_EMPTY_TO_NULL, Normalise::UPPERCASE],
        );
        $this->assertNull($result);
    }

    public function testApplyNullableAppliesOpsToNonNullInput(): void
    {
        $this->assertSame(
            'hello',
            Normalise::applyNullable('  HELLO  ', [Normalise::TRIM, Normalise::LOWERCASE]),
        );
    }

    public function testConstantsHaveExpectedStringValues(): void
    {
        // The generated PHP refers to these by class constant, but the
        // constant string values are part of the public contract — they
        // must match the JS runtime's op identifiers exactly.
        $this->assertSame('trim', Normalise::TRIM);
        $this->assertSame('lowercase', Normalise::LOWERCASE);
        $this->assertSame('uppercase', Normalise::UPPERCASE);
        $this->assertSame('nullEmptyToNull', Normalise::NULL_EMPTY_TO_NULL);
    }
}
