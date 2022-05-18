<?php

namespace App\Validator\Period;

use Attribute;
use Symfony\Component\Validator\Constraint;

#[Attribute]
class AssertNoOverlappingPeriods extends Constraint {
    public string $message = 'Must not overlap with the other periods of the camp.';

    public function getTargets() {
        return self::CLASS_CONSTRAINT;
    }
}
