<?php

namespace App\Tests\Validator\Period;

use App\Entity\Camp;
use App\Entity\Period;
use App\Validator\Period\AssertNoOverlappingPeriods;
use App\Validator\Period\AssertNoOverlappingPeriodsValidator;
use DateTime;
use Symfony\Component\Validator\Constraints\Email;
use Symfony\Component\Validator\Exception\UnexpectedTypeException;
use Symfony\Component\Validator\Test\ConstraintValidatorTestCase;

/**
 * @internal
 */
class AssertNoOverlappingPeriodsValidatorTest extends ConstraintValidatorTestCase {
    private ?Camp $camp = null;

    public function testExpectesMatchingAnnotation() {
        $this->expectException(UnexpectedTypeException::class);
        $this->validator->validate(null, new Email());
    }

    public function testNullIsValid() {
        $this->validator->validate(null, new AssertNoOverlappingPeriods());
        $this->assertNoViolation();
    }

    public function testEmptyIsValid() {
        $this->validator->validate('', new AssertNoOverlappingPeriods());
        $this->assertNoViolation();
    }

    public function testPeriodWithoutCampIsValid() {
        $this->validator->validate(new Period(), new AssertNoOverlappingPeriods());
        $this->assertNoViolation();
    }

    public function testAllowsNoOverlap() {
        $period1 = $this->createPeriod('2022-01-01', '2022-01-07');
        $period2 = $this->createPeriod('2022-01-08', '2022-01-09');

        $this->validator->validate($period1, new AssertNoOverlappingPeriods());
        $this->assertNoViolation();
        $this->validator->validate($period2, new AssertNoOverlappingPeriods());
        $this->assertNoViolation();
    }

    public function testOverlapAtStart() {
        $period1 = $this->createPeriod('2022-01-01', '2022-01-07');
        $period2 = $this->createPeriod('2022-01-05', '2022-01-09');

        $this->validator->validate($period2, new AssertNoOverlappingPeriods());
        $this->buildViolation('Must not overlap with the other periods of the camp.')->assertRaised();
    }

    public function testOverlapAtEnd() {
        $period1 = $this->createPeriod('2022-01-01', '2022-01-07');
        $period2 = $this->createPeriod('2022-01-05', '2022-01-09');

        $this->validator->validate($period1, new AssertNoOverlappingPeriods());
        $this->buildViolation('Must not overlap with the other periods of the camp.')->assertRaised();
    }

    public function testContainedInOtherPeriod() {
        $period1 = $this->createPeriod('2022-01-03', '2022-01-04');
        $period2 = $this->createPeriod('2022-01-01', '2022-01-09');

        $this->validator->validate($period1, new AssertNoOverlappingPeriods());
        $this->buildViolation('Must not overlap with the other periods of the camp.')->assertRaised();
    }

    public function testContainingOtherPeriod() {
        $period1 = $this->createPeriod('2022-01-03', '2022-01-04');
        $period2 = $this->createPeriod('2022-01-01', '2022-01-09');

        $this->validator->validate($period2, new AssertNoOverlappingPeriods());
        $this->buildViolation('Must not overlap with the other periods of the camp.')->assertRaised();
    }

    public function testOverlapOnEndingDay() {
        $period1 = $this->createPeriod('2022-01-01', '2022-01-04');
        $period2 = $this->createPeriod('2022-01-04', '2022-01-09');

        $this->validator->validate($period1, new AssertNoOverlappingPeriods());
        $this->buildViolation('Must not overlap with the other periods of the camp.')->assertRaised();
    }

    public function testOverlapOnStartingDay() {
        $period1 = $this->createPeriod('2022-01-01', '2022-01-04');
        $period2 = $this->createPeriod('2022-01-04', '2022-01-09');

        $this->validator->validate($period2, new AssertNoOverlappingPeriods());
        $this->buildViolation('Must not overlap with the other periods of the camp.')->assertRaised();
    }

    protected function createPeriod(string $start, string $end): Period {
        $period = new Period();
        $this->getCamp()->addPeriod($period);
        $period->start = DateTime::createFromFormat('Y-m-d', $start);
        $period->end = DateTime::createFromFormat('Y-m-d', $end);

        return $period;
    }

    protected function getCamp(): Camp {
        if (null === $this->camp) {
            $this->camp = new Camp();
        }

        return $this->camp;
    }

    protected function createValidator() {
        return new AssertNoOverlappingPeriodsValidator();
    }
}
