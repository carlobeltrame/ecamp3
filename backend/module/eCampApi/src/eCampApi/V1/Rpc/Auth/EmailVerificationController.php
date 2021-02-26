<?php

namespace eCampApi\V1\Rpc\Auth;

use eCamp\Core\EntityService\UserService;
use Laminas\ApiTools\ApiProblem\ApiProblem;
use Laminas\ApiTools\ApiProblem\View\ApiProblemModel;
use Laminas\ApiTools\Hal\Entity;
use Laminas\ApiTools\Hal\Link\Link;
use Laminas\ApiTools\Hal\View\HalJsonModel;
use Laminas\Mvc\Controller\AbstractActionController;
use Laminas\Mvc\InjectApplicationEventInterface;
use Laminas\Mvc\MvcEvent;
use Laminas\Router\Http\RouteMatch;
use Laminas\View\Model\ViewModel;

class EmailVerificationController extends AbstractActionController implements InjectApplicationEventInterface {
    /** @var MvcEvent */
    protected $event;
    private UserService $userService;

    public function __construct(
        UserService $userService
    ) {
        $this->userService = $userService;
    }

    public function verifyAction(): ViewModel {
        /** @var RouteMatch $routeParams */
        $routeParams = $this->event->getRouteMatch();
        $token = $routeParams->getParam('token');

        if (!$token) {
            return new ApiProblemModel(new ApiProblem(401, 'verification token missing'));
        }

        try {
            $email = $this->userService->verifyEmail($token);
        } catch (\Exception $e) {
            return new ApiProblemModel(new ApiProblem(404, $e->getMessage()));
        }

        return new HalJsonModel(['payload' => new Entity([
            'self' => Link::factory([
                'rel' => 'self',
                'href' => $this->getRequest()->getUriString(),
            ]),
            'verifiedEmail' => $email,
        ])]);
    }
}
