<?php

namespace eCamp\Core\Hydrator;

use eCamp\Core\Entity\User;
use Laminas\Authentication\AuthenticationService;
use Laminas\Hydrator\HydratorInterface;

class UserHydrator implements HydratorInterface {
    public static function HydrateInfo(): array {
        return [
        ];
    }

    /**
     * @param object $object
     */
    public function extract($object): array {
        $auth = new AuthenticationService();
        /** @var User $user */
        $user = $object;

        $relation = $user->getRelation($auth->getIdentity());
        $showDetails = (User::RELATION_UNRELATED != $relation);

        return [
            'id' => $user->getId(),
            'username' => $user->getUsername(),
            'firstname' => $user->getFirstname(),
            'surname' => $user->getSurname(),
            'nickname' => $user->getNickname(),
            'displayName' => $user->getDisplayName(),
            'mail' => $showDetails ? $user->getTrustedMailAddress() : '***',
            'relation' => $relation,
            'role' => $user->getRole(),
        ];
    }

    /**
     * @param object $object
     *
     * @throws \Exception
     */
    public function hydrate(array $data, $object): User {
        /** @var User $user */
        $user = $object;

        if (isset($data['username'])) {
            $user->setUsername($data['username']);
        }
        if (isset($data['firstname'])) {
            $user->setFirstname($data['firstname']);
        }
        if (isset($data['surname'])) {
            $user->setSurname($data['surname']);
        }
        if (isset($data['nickname'])) {
            $user->setNickname($data['nickname']);
        }
        if (isset($data['language'])) {
            $user->setLanguage($data['language']);
        }

        return $user;
    }
}
