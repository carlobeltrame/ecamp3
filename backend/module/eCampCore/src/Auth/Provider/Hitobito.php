<?php

namespace eCamp\Core\Auth\Provider;

use Hybridauth\Adapter\OAuth2;
use Hybridauth\Data;
use Hybridauth\Exception\UnexpectedApiResponseException;
use Hybridauth\User\Profile;

abstract class Hitobito extends OAuth2 {
    protected $scope = 'name';

    public function getUserProfile(): Profile {
        // Send a signed http request to provider API to request user's profile
        $response = $this->apiRequest('profile', 'GET', [], ['X-Scope' => $this->scope]);
        $data = new Data\Collection($response);

        if (!$data->exists('id')) {
            throw new UnexpectedApiResponseException('Provider API returned an unexpected response.');
        }

        $userProfile = new Profile();

        $userProfile->identifier = $data->get('email');
        $userProfile->firstName = $data->get('first_name');
        $userProfile->lastName = $data->get('last_name');
        $userProfile->displayName = $data->get('nickname');
        $userProfile->email = $data->get('email');
        $userProfile->emailVerified = $data->get('email');

        return $userProfile;
    }

    protected function configure(): void {
        parent::configure();
        $this->apiBaseUrl = preg_replace('/\/(profile)?$/', '', $this->config->filter('endpoints')->get('profile'));
        $this->authorizeUrl = $this->config->filter('endpoints')->get('authorize');
        $this->accessTokenUrl = $this->config->filter('endpoints')->get('token');
    }
}
