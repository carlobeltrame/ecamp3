<?php

namespace eCamp\Core\EntityService;

use Doctrine\ORM\ORMException;
use eCamp\Core\Entity\Camp;
use eCamp\Core\Entity\Day;
use eCamp\Core\Entity\Period;
use eCamp\Core\Hydrator\DayHydrator;
use eCamp\Lib\Acl\Acl;
use eCamp\Lib\Acl\NoAccessException;
use eCamp\Lib\Service\ServiceUtils;
use Zend\Authentication\AuthenticationService;
use ZF\ApiProblem\ApiProblem;

class DayService extends AbstractEntityService {
    public function __construct(ServiceUtils $serviceUtils, AuthenticationService $authenticationService) {
        parent::__construct(
            $serviceUtils,
            Day::class,
            DayHydrator::class,
            $authenticationService
        );
    }

    /**
     * @param mixed $data
     *
     * @throws ORMException
     * @throws NoAccessException
     *
     * @return ApiProblem|Day
     */
    public function create($data) {
        /** @var Period $period */
        $period = $this->findEntity(Period::class, $data->periodId);

        /** @var Day $day */
        $day = parent::create($data);
        $period->addDay($day);

        $this->assertAllowed($day, Acl::REST_PRIVILEGE_CREATE);

        return $day;
    }

    /**
     * @param mixed $id
     *
     * @throws NoAccessException
     * @throws ORMException
     *
     * @return null|ApiProblem|bool
     */
    public function delete($id) {
        /** @var Day $day */
        $day = $this->fetch($id);
        $period = $day->getPeriod();
        $period->removeDay($day);

        return parent::delete($id);
    }

    protected function fetchAllQueryBuilder($params = []) {
        $q = parent::fetchAllQueryBuilder($params);
        $q->join('row.period', 'p');
        $q->andWhere($this->createFilter($q, Camp::class, 'p', 'camp'));

        if (isset($params['campId'])) {
            $q->andWhere('p.camp = :campId');
            $q->setParameter('campId', $params['campId']);
        }

        if (isset($params['periodId'])) {
            $q->andWhere('row.period = :periodId');
            $q->setParameter('periodId', $params['periodId']);
        }

        $q->orderBy('row.period, row.dayOffset');

        return $q;
    }

    protected function fetchQueryBuilder($id) {
        $q = parent::fetchQueryBuilder($id);
        $q->join('row.period', 'p');
        $q->andWhere($this->createFilter($q, Camp::class, 'p', 'camp'));

        return $q;
    }
}
