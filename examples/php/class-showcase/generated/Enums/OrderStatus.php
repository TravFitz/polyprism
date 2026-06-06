<?php

declare(strict_types=1);

namespace Generated\Enums;

enum OrderStatus: string
{
    case PENDING = 'PENDING';
    case PAID = 'PAID';
    case SHIPPED = 'SHIPPED';
    case CANCELLED = 'CANCELLED';
}
