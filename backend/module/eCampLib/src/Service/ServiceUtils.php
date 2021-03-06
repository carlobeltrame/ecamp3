<?php

namespace eCamp\Lib\Service;

use Doctrine\ORM\EntityManager;
use Doctrine\ORM\EntityRepository;
use Doctrine\ORM\ORMException;
use Doctrine\ORM\QueryBuilder;
use eCamp\Lib\Acl\Acl;
use eCamp\Lib\Acl\NoAccessException;
use eCamp\Lib\Entity\BaseEntity;
use eCamp\Lib\EntityFilter\EntityFilterInterface;
use eCamp\Lib\ServiceManager\EntityFilterManager;
use Laminas\Hydrator\HydratorInterface;
use Laminas\Hydrator\HydratorPluginManager;
use Laminas\Permissions\Acl\Resource\ResourceInterface;
use Laminas\Permissions\Acl\Role\RoleInterface;

class ServiceUtils {
    /** @var EntityManager */
    private $entityManager;

    /** @var Acl */
    private $acl;

    /** @var EntityFilterManager */
    private $entityFilterManager;

    /** @var HydratorPluginManager */
    private $hydratorPluginManager;

    public function __construct(
        Acl $acl,
        EntityManager $entityManager,
        EntityFilterManager $entityFilterManager,
        HydratorPluginManager $hydratorPluginManager
    ) {
        $this->acl = $acl;
        $this->entityManager = $entityManager;
        $this->entityFilterManager = $entityFilterManager;
        $this->hydratorPluginManager = $hydratorPluginManager;
    }

    /**
     * @param RoleInterface|string     $role
     * @param ResourceInterface|string $resource
     * @param string                   $privilege
     */
    public function aclIsAllowed($role = null, $resource = null, $privilege = null): bool {
        return $this->acl->isAllowed($role, $resource, $privilege);
    }

    /**
     * @param RoleInterface|string     $role
     * @param ResourceInterface|string $resource
     * @param string                   $privilege
     *
     * @throws NoAccessException
     */
    public function aclAssertAllowed($role = null, $resource = null, $privilege = null): void {
        $this->acl->assertAllowed($role, $resource, $privilege);
    }

    public function emCreateQueryBuilder(): QueryBuilder {
        return $this->entityManager->createQueryBuilder();
    }

    public function emGetRepository(string $entityName): EntityRepository {
        return $this->entityManager->getRepository($entityName);
    }

    public function emGetOrigEntityData(BaseEntity $entity): array {
        $uow = $this->entityManager->getUnitOfWork();

        return $uow->getOriginalEntityData($entity);
    }

    /**
     * @throws ORMException
     */
    public function emPersist(BaseEntity $entity): void {
        $this->entityManager->persist($entity);
    }

    /**
     * @throws ORMException
     */
    public function emRemove(BaseEntity $entity): void {
        $this->entityManager->remove($entity);
    }

    /**
     * @throws ORMException
     * @throws \Doctrine\ORM\OptimisticLockException
     */
    public function emFlush(): void {
        $this->entityManager->flush();
    }

    public function getEntityFilter(string $className): ?EntityFilterInterface {
        return $this->entityFilterManager->getByEntityClass($className);
    }

    public function getHydrator(string $name, array $options = null): ?HydratorInterface {
        return $this->hydratorPluginManager->get($name, $options);
    }
}
