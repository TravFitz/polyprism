<?php

declare(strict_types=1);

namespace Generated\Enums;

/**
 * Customer membership tier. Stored as a string in the DB; PHP enum
 * values match the DB values one-for-one.
 */
enum CustomerTier: string
{
    case FREE = 'FREE';
    case PRO = 'PRO';
    case ENTERPRISE = 'ENTERPRISE';
}
