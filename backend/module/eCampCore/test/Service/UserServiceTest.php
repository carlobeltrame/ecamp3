<?php

namespace eCamp\CoreTest\Service;

use eCamp\Core\Entity\User;
use eCamp\Core\EntityService\UserService;
use eCamp\Lib\Service\EntityNotFoundException;
use eCamp\LibTest\PHPUnit\AbstractDatabaseTestCase;
use Laminas\Authentication\AuthenticationService;
use PHPUnit\Framework\Constraint\Constraint;

/**
 * @internal
 */
class UserServiceTest extends AbstractDatabaseTestCase {
    const USERNAME = 'username';
    const EMAIL = 'test@eCamp3.ch';

    public function testCreateUser() {
        /** @var UserService $userService */
        $userService = \eCampApp::GetService(UserService::class);

        /** @var User $user */
        $user = $userService->create((object) [
            'username' => self::USERNAME,
            'mailAddress' => self::EMAIL,
        ]);

        $this->assertEquals(User::STATE_NONREGISTERED, $user->getState());
    }

    public function testGetUser() {
        /** @var UserService $userService */
        $userService = \eCampApp::GetService(UserService::class);
        /** @var AuthenticationService $auth */
        $auth = \eCampApp::GetService(AuthenticationService::class);

        $user = $userService->create((object) [
            'username' => 'username2',
            'mailAddress' => 'test2@eCamp3.ch',
        ]);

        $this->getEntityManager()->flush();
        $auth->getStorage()->write($user->getId());

        $userId = $user->getId();
        $user2 = $userService->fetch($userId);
        $this->assertEquals($user, $user2);

        $this->expectException(EntityNotFoundException::class);
        $user3 = $userService->fetch(-1);
    }

    public function testGetUserByEmail() {
        /** @var UserService $userService */
        $userService = \eCampApp::GetService(UserService::class);

        $user = $userService->create((object) [
            'username' => self::USERNAME,
            'mailAddress' => self::EMAIL,
        ]);

        $foundUser = $userService->findByUntrustedMail(self::EMAIL);
        $this->assertThat($foundUser, self::isSameUserAs($user));
    }

    public function testGetUserByName() {
        /** @var UserService $userService */
        $userService = \eCampApp::GetService(UserService::class);

        $user = $userService->create((object) [
            'username' => self::USERNAME,
            'mailAddress' => self::EMAIL,
        ]);

        $foundUser = $userService->findByUsername(self::USERNAME);
        $this->assertThat($foundUser, self::isSameUserAs($user));
    }

    private static function isSameUserAs($user) {
        return new class($user) extends Constraint {
            private User $user;

            /** @noinspection PhpMissingParentConstructorInspection */
            public function __construct(User $user) {
                $this->user = $user;
            }

            /**
             * @param User $other
             */
            protected function matches($other) {
                return $other instanceof User && $other->getId() == $this->user->getId();
            }

            /**
             * @param User $other
             *
             * @return string
             */
            protected function failureDescription($other) {
                return sprintf(
                    ' the id of the %s [id=%s, username=%s, email= %s] should be %s, was %s',
                    User::class,
                    $other->getId(),
                    $other->getUsername(),
                    $other->getTrustedMailAddress().', '.$other->getUntrustedMailAddress(),
                    $this->user->getId(),
                    $other->getId()
                );
            }

            public function toString() {
                return sprintf(
                    ' has the same id as %s [id=%s, username=%s, email= %s]',
                    User::class,
                    $this->user->getId(),
                    $this->user->getUsername(),
                    $this->user->getTrustedMailAddress().', '.$this->user->getUntrustedMailAddress()
                );
            }
        };
    }
}
