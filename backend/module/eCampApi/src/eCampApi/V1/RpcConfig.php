<?php

namespace eCampApi\V1;

use eCamp\Lib\Entity\EntityLink;
use eCamp\Lib\Entity\EntityLinkCollection;
use Laminas\Di\Container\ServiceManager\AutowireFactory;
use Laminas\Stdlib\ArrayUtils;

class RpcConfig {
    private string $routeName;
    private string $controller;
    private string $route;
    private array $parameterDefaults = [];
    private array $allowedHttpMethods;
    private array $collectionQueryWhiteList = [];

    private function __construct($routeName) {
        $this->routeName = $routeName;
    }

    public static function forRoute($routeName): RpcConfig {
        return new RpcConfig($routeName);
    }

    public static function merge(...$configs): array {
        $result = [];
        foreach ($configs as $config) {
            $result = ArrayUtils::merge($result, $config);
        }

        return $result;
    }

    public function setController(string $controller): RpcConfig {
        $this->controller = $controller;

        return $this;
    }

    public function setRoute(string $route): RpcConfig {
        $this->route = $route;

        return $this;
    }

    public function addParameterDefault(string $parameter, string $default): RpcConfig {
        $this->parameterDefaults[$parameter] = $default;

        return $this;
    }

    public function setAllowedHttpMethods(string ...$allowedHttpMethods): RpcConfig {
        $this->allowedHttpMethods = $allowedHttpMethods;

        return $this;
    }

    public function setCollectionQueryWhiteList(string ...$collectionQueryWhiteList): RpcConfig {
        $this->collectionQueryWhiteList = $collectionQueryWhiteList;

        return $this;
    }

    public function build() {
        $config = [
            'router' => [
                'routes' => [
                    $this->routeName => [
                        'type' => 'Segment',
                        'options' => [
                            'route' => $this->route,
                            'defaults' => array_merge(['controller' => $this->controller], $this->parameterDefaults),
                        ],
                    ],
                ],
            ],
            'controllers' => [
                'factories' => [
                    $this->controller => AutowireFactory::class,
                ],
            ],
            'api-tools-content-negotiation' => [
                'controllers' => [
                    $this->controller => 'HalJson',
                ],
                'accept_whitelist' => [
                    $this->controller => [
                        '0' => 'application/vnd.e-camp-api.v1+json',
                        '1' => 'application/json',
                        '2' => 'application/*+json',
                    ],
                ],
                'content_type_whitelist' => [
                    $this->controller => [
                        '0' => 'application/vnd.e-camp-api.v1+json',
                        '1' => 'application/json',
                    ],
                ],
            ],
            'api-tools-hal' => [
                'metadata_map' => [
                    EntityLink::class => [
                        'route_identifier_name' => 'id',
                        'entity_identifier_name' => 'id',
                        'route_name' => '',
                    ],
                    EntityLinkCollection::class => [
                        'entity_identifier_name' => 'id',
                        'route_name' => '',
                        'is_collection' => true,
                    ],
                ],
            ],
            'api-tools-rpc' => [
                $this->controller => [
                    'http_methods' => $this->allowedHttpMethods,
                    'route_name' => $this->routeName,
                ],
            ],
        ];
        if (sizeof($this->collectionQueryWhiteList) > 0) {
            $config['api-tools-rpc'][$this->controller]['collection_query_whitelist'] = $this->collectionQueryWhiteList;
        }

        return $config;
    }
}
