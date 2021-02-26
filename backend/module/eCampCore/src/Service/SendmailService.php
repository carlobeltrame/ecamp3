<?php

namespace eCamp\Core\Service;

use eCamp\Core\Entity\Camp;
use eCamp\Core\Entity\User;
use eCamp\Lib\Mail\MessageData;
use eCamp\Lib\Mail\ProviderInterface;
use eCamp\Lib\Service\ServiceUtils;
use Laminas\Authentication\AuthenticationService;

class SendmailService extends AbstractService {
    private ProviderInterface $mailProvider;
    private string $from;
    private string $frontendUrl;

    public function __construct(
        ServiceUtils $serviceUtils,
        AuthenticationService $authenticationService,
        ProviderInterface $mailProvider,
        $from,
        $frontendUrl
    ) {
        parent::__construct($serviceUtils, $authenticationService);

        $this->mailProvider = $mailProvider;
        $this->from = $from;
        $this->frontendUrl = $frontendUrl;
    }

    public function sendRegisterMail(User $user, $key): void {
        $data = new MessageData();
        $data->from = $this->from;
        $data->to = $user->getUntrustedMailAddress();
        $data->subject = 'Registered';
        $data->template = 'register';
        $data->data = [
            'user_name' => $user->getDisplayName(),
            'url' => "{$this->frontendUrl}/verify-email/{$key}",
        ];

        $this->mailProvider->sendMail($data);
    }

    public function sendInviteToCampMail(User $byUser, Camp $camp, string $key, string $emailToInvite): void {
        $data = new MessageData();
        $data->from = $this->from;
        $data->to = $emailToInvite;
        $data->subject = "You were invited to collaborate in camp {$camp->getName()}";
        $data->template = 'campCollaborationInvite';
        $data->data = [
            'by_user' => $byUser->getDisplayName(),
            'url' => "{$this->frontendUrl}/camps/invitation/{$key}",
            'camp_name' => $camp->getName(),
        ];

        $this->mailProvider->sendMail($data);
    }
}
