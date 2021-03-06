<?php

namespace eCampApi\V1\Rpc\Invitation;

use Doctrine\ORM\NonUniqueResultException;
use eCamp\Core\Hydrator\InvitationHydrator;
use eCamp\Core\Service\Invitation;
use eCamp\Core\Service\InvitationService;
use eCamp\Lib\Acl\NoAccessException;
use eCamp\Lib\Acl\NotAuthenticatedException;
use eCamp\Lib\Service\EntityNotFoundException;
use eCamp\Lib\Service\EntityValidationException;
use eCamp\Lib\Service\ServiceUtils;
use Laminas\ApiTools\Hal\Entity;
use Laminas\ApiTools\Hal\Link\Link;
use Laminas\ApiTools\Hal\View\HalJsonModel;
use Laminas\ApiTools\Rpc\RpcController;

class InvitationController extends RpcController {
    private InvitationService $invitationService;
    private ServiceUtils $serviceUtils;

    public function __construct(InvitationService $invitationService, ServiceUtils $serviceUtils) {
        $this->invitationService = $invitationService;
        $this->serviceUtils = $serviceUtils;
    }

    public function index(): HalJsonModel {
        $data = [];
        $data['title'] = 'Invitations';
        $data['self'] = Link::factory([
            'rel' => 'self',
            'route' => [
                'name' => 'e-camp-api.rpc.invitation',
            ],
        ]);
        $data['find'] = Link::factory([
            'rel' => 'find',
            'route' => [
                'name' => 'e-camp-api.rpc.invitation.find',
                'params' => [
                    'inviteKey' => 'add_inviteKey_here',
                ],
            ],
        ]);
        $data['accept'] = Link::factory([
            'rel' => 'accept',
            'route' => [
                'name' => 'e-camp-api.rpc.invitation.accept',
                'params' => [
                    'inviteKey' => 'add_inviteKey_here',
                ],
            ],
        ]);
        $data['reject'] = Link::factory([
            'rel' => 'reject',
            'route' => [
                'name' => 'e-camp-api.rpc.invitation.reject',
                'params' => [
                    'inviteKey' => 'add_inviteKey_here',
                ],
            ],
        ]);
        $data['resend'] = Link::factory([
            'rel' => 'resend',
            'route' => [
                'name' => 'e-camp-api.rpc.invitation.resend',
                'params' => [
                    'campCollaborationId' => 'insert_campCollaborationId_here',
                ],
            ],
        ]);
        $json = new HalJsonModel();
        $json->setPayload(new Entity($data));

        return $json;
    }

    /**
     * @param $inviteKey
     *
     * @throws EntityNotFoundException
     */
    public function find($inviteKey): HalJsonModel {
        $invitation = $this->invitationService->findInvitation($inviteKey);
        if (null == $invitation) {
            throw new EntityNotFoundException('Not Found', 404);
        }

        return $this->toResponse($invitation);
    }

    /**
     * @param $inviteKey
     *
     * @throws EntityNotFoundException
     * @throws EntityValidationException
     * @throws NoAccessException
     * @throws NotAuthenticatedException
     * @throws \Doctrine\ORM\ORMException
     */
    public function accept($inviteKey): HalJsonModel {
        try {
            return $this->toResponse($this->invitationService->acceptInvitation($inviteKey));
        } catch (NonUniqueResultException $e) {
            throw new \Exception('Error getting CampCollaboration', 500);
        } catch (NoAccessException $e) {
            throw new NoAccessException('No access', 403);
        } catch (NotAuthenticatedException $e) {
            throw new NotAuthenticatedException('Not authorized', 401);
        } catch (EntityNotFoundException $e) {
            throw new EntityNotFoundException('Not Found', 404);
        } catch (EntityValidationException $e) {
            $entityValidationException = new EntityValidationException('Failed to update Invitation', 422);
            $entityValidationException->setMessages($e->getMessages());

            throw $entityValidationException;
        }
    }

    /**
     * @param $inviteKey
     *
     * @throws EntityNotFoundException
     */
    public function reject($inviteKey): HalJsonModel {
        try {
            return $this->toResponse($this->invitationService->rejectInvitation($inviteKey));
        } catch (EntityNotFoundException $e) {
            throw new EntityNotFoundException('Not Found', 404);
        }
    }

    /**
     * @throws EntityNotFoundException
     * @throws NotAuthenticatedException
     * @throws NoAccessException
     * @throws EntityValidationException
     */
    public function resend($campCollaborationId): HalJsonModel {
        try {
            return $this->toResponse($this->invitationService->resendInvitation($campCollaborationId));
        } catch (EntityNotFoundException $e) {
            throw new EntityNotFoundException('Not Found', 404);
        } catch (NoAccessException $e) {
            throw new NoAccessException('No Access', 403);
        } catch (NotAuthenticatedException $e) {
            throw new NotAuthenticatedException('Not Authorized', 401);
        } catch (EntityValidationException $e) {
            throw new EntityValidationException($e->getMessage(), 422);
        }
    }

    private function toResponse(Invitation $invitation): HalJsonModel {
        $hydrator = $this->serviceUtils->getHydrator(InvitationHydrator::class);

        $data = $hydrator->extract($invitation);
        $data['self'] = Link::factory([
            'rel' => 'self',
            'route' => [
                'name' => 'e-camp-api.rpc.invitation.find',
            ],
        ]);
        $json = new HalJsonModel();
        $payload = new Entity($data);

        $json->setPayload($payload);

        return $json;
    }
}
