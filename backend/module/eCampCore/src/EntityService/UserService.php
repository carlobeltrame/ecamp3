<?php

namespace eCamp\Core\EntityService;

use Doctrine\ORM\ORMException;
use Doctrine\ORM\Query\Expr;
use Doctrine\ORM\QueryBuilder;
use eCamp\Core\Entity\User;
use eCamp\Core\Hydrator\UserHydrator;
use eCamp\Core\Repository\UserRepository;
use eCamp\Core\Service\SendmailService;
use eCamp\Lib\Service\EntityNotFoundException;
use eCamp\Lib\Service\ServiceUtils;
use Hybridauth\User\Profile;
use Laminas\Authentication\AuthenticationService;

/**
 * Class UserService.
 */
class UserService extends AbstractEntityService {
    private SendmailService $sendmailService;

    public function __construct(
        ServiceUtils $serviceUtils,
        AuthenticationService $authenticationService,
        SendmailService $sendmailService
    ) {
        parent::__construct(
            $serviceUtils,
            User::class,
            UserHydrator::class,
            $authenticationService
        );

        $this->sendmailService = $sendmailService;
    }

    public function findAuthenticatedUser(): ?User {
        $user = $this->getAuthUser();
        if ($user instanceof User) {
            return $user;
        }

        return null;
    }

    public function findByTrustedMail($email): ?User {
        /** @var UserRepository $repository */
        $repository = $this->getRepository();

        return $repository->findByTrustedMail($email);
    }

    public function findByUntrustedMail($email): ?User {
        /** @var UserRepository $repository */
        $repository = $this->getRepository();

        return $repository->findByUntrustedMail($email);
    }

    public function findByUsername($username): ?User {
        /** @var UserRepository $userRepository */
        $userRepository = $this->getRepository();

        return $userRepository->findByUsername($username);
    }

    /**
     * @throws EntityNotFoundException
     * @throws \Exception
     */
    public function verifyEmail(string $token): string {
        /** @var UserRepository $repository */
        $repository = $this->getRepository();
        $user = $repository->findByVerificationCode($token);

        if (null == $user) {
            throw new EntityNotFoundException();
        }

        if (!$user->verifyMailAddress($token)) {
            throw new EntityNotFoundException();
        }

        $this->getRepository()->saveWithoutAcl($user);

        return $user->getTrustedMailAddress();
    }

    /**
     * @throws ORMException
     * @throws \Exception
     */
    protected function createEntity($data): User {
        /** @var Profile $profile */
        $profile = $data;

        if ($profile instanceof Profile) {
            $data = (object) [
                'username' => $profile->displayName,
                'firstname' => $profile->firstName,
                'surname' => $profile->lastName,
                'mailAddress' => $profile->emailVerified,
                'language' => $profile->language,
                'state' => User::STATE_REGISTERED,
            ];

            if (isset($profile->birthDay, $profile->birthMonth, $profile->birthYear)) {
                $data['birthday'] = $profile->birthYear.'-'.$profile->birthMonth.'-'.$profile->birthDay;
            }
        }

        $state = isset($data->state) ? $data->state : User::STATE_NONREGISTERED;
        if (!in_array($state, [User::STATE_NONREGISTERED, User::STATE_REGISTERED])) {
            throw new \Exception('Invalid state: '.$state);
        }

        /** @var User $user */
        $user = parent::createEntity($data);
        $user->setState($state);
        $user->setRole(User::ROLE_USER);

        $key = $user->setMailAddress($data->mailAddress);

        if ($profile instanceof Profile) {
            $user->verifyMailAddress($key);
        } else {
            $this->sendmailService->sendRegisterMail($user, $key);
        }

        return $user;
    }

    protected function findCollectionQueryBuilder($className, $alias, $params): QueryBuilder {
        $q = parent::findCollectionQueryBuilder($className, $alias, $params);
        if (isset($params['search'])) {
            $expr = new Expr();
            $q->andWhere($expr->orX(
                $expr->like($expr->lower($alias.'.username'), ':search')
            ));
            $q->setParameter('search', '%'.strtolower($params['search']).'%');
        }

        return $q;
    }
}
