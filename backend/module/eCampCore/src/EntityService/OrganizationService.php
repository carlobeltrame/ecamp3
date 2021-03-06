<?php

namespace eCamp\Core\EntityService;

use eCamp\Core\Entity\Organization;
use eCamp\Core\Hydrator\OrganizationHydrator;
use eCamp\Lib\Service\ServiceUtils;
use eCampApi\V1\Rest\Organization\OrganizationCollection;
use Laminas\Authentication\AuthenticationService;

class OrganizationService extends AbstractEntityService {
    public function __construct(ServiceUtils $serviceUtils, AuthenticationService $authenticationService) {
        parent::__construct(
            $serviceUtils,
            Organization::class,
            OrganizationCollection::class,
            OrganizationHydrator::class,
            $authenticationService
        );
    }
}
