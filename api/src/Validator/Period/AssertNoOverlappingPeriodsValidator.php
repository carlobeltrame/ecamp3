<?php

namespace App\Validator\Period;

use App\Entity\Period;
use Symfony\Component\Validator\Constraint;
use Symfony\Component\Validator\ConstraintValidator;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;

class AssertNoOverlappingPeriodsValidator extends ConstraintValidator {
    public function validate($period, Constraint $constraint) {
        if (!$constraint instanceof AssertNoOverlappingPeriods) {
            throw new UnexpectedTypeException($constraint, AssertNoOverlappingPeriods::class);
        }

        if (null === $period || !$period instanceof Period || null === $period->camp) {
            return;
        }

        $camp = $period->camp;

        foreach ($camp->periods as $otherPeriod) {
            if ($otherPeriod === $period) {
                continue;
            }

            if ($this->periodsOverlap($period, $otherPeriod)) {
                $this->context->buildViolation($constraint->message)
                    ->addViolation()
                ;
            }
        }
    }

    protected function periodsOverlap(Period $period1, Period $period2) {
        return ($period2->start <= $period1->end)
            && ($period2->end >= $period1->start);
    }
}
