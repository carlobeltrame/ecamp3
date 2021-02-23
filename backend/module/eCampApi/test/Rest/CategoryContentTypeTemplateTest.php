<?php

namespace eCamp\ApiTest\Rest;

use Doctrine\Common\DataFixtures\Loader;
use eCamp\Core\Entity\CategoryContentTypeTemplate;
use eCamp\Core\Entity\User;
use eCamp\CoreTest\Data\CategoryContentTypeTemplateTestData;
use eCamp\CoreTest\Data\CategoryTemplateTestData;
use eCamp\CoreTest\Data\UserTestData;
use eCamp\LibTest\PHPUnit\AbstractApiControllerTestCase;

/**
 * @internal
 */
class CategoryContentTypeTemplateTest extends AbstractApiControllerTestCase {
    /** @var CategoryContentTypeTemplate */
    protected $categoryContentTypeTemplate;

    /** @var CategoryTemplate */
    protected $categoryTemplate;

    /** @var User */
    protected $user;

    private $apiEndpoint = '/api/category-content-type-templates';

    public function setUp(): void {
        parent::setUp();

        $userLoader = new UserTestData();
        $categoryTemplateLoader = new CategoryTemplateTestData();
        $categoryContentTypeTemplateLoader = new CategoryContentTypeTemplateTestData();

        $loader = new Loader();
        $loader->addFixture($userLoader);
        $loader->addFixture($categoryTemplateLoader);
        $loader->addFixture($categoryContentTypeTemplateLoader);
        $this->loadFixtures($loader);

        $this->user = $userLoader->getReference(UserTestData::$USER1);
        $this->categoryTemplate = $categoryTemplateLoader->getReference(CategoryTemplateTestData::$TEMPLATE1);
        $this->categoryContentTypeTemplate = $categoryContentTypeTemplateLoader->getReference(CategoryContentTypeTemplateTestData::$TEMPLATE1);

        $this->authenticateUser($this->user);
    }

    public function testFetch(): void {
        $this->dispatch("{$this->apiEndpoint}/{$this->categoryContentTypeTemplate->getId()}", 'GET');

        $this->assertResponseStatusCode(200);

        $expectedBody = <<<JSON
            {
                "id": "{$this->categoryContentTypeTemplate->getId()}"
            }
JSON;

        $expectedLinks = <<<JSON
            {
                "self": {
                    "href": "http://{$this->host}{$this->apiEndpoint}/{$this->categoryContentTypeTemplate->getId()}"
                }
            }
JSON;
        $expectedEmbeddedObjects = ['contentType'];

        $this->verifyHalResourceResponse($expectedBody, $expectedLinks, $expectedEmbeddedObjects);
    }

    public function testFetchAll(): void {
        $categoryTemplateId = $this->categoryTemplate->getId();
        $this->dispatch("{$this->apiEndpoint}?page_size=10&categoryTemplateId={$categoryTemplateId}", 'GET');

        $this->assertResponseStatusCode(200);

        $this->assertEquals(1, $this->getResponseContent()->total_items);
        $this->assertEquals(10, $this->getResponseContent()->page_size);
        $this->assertEquals("http://{$this->host}{$this->apiEndpoint}?page_size=10&categoryTemplateId={$categoryTemplateId}&page=1", $this->getResponseContent()->_links->self->href);
        $this->assertEquals($this->categoryContentTypeTemplate->getId(), $this->getResponseContent()->_embedded->items[0]->id);
    }

    public function testCreateForbidden(): void {
        $this->dispatch("{$this->apiEndpoint}", 'POST');
        $this->assertResponseStatusCode(405);
    }

    public function testPatchForbidden(): void {
        $this->dispatch("{$this->apiEndpoint}/{$this->categoryContentTypeTemplate->getId()}", 'PATCH');
        $this->assertResponseStatusCode(405);
    }

    public function testUpdateForbidden(): void {
        $this->dispatch("{$this->apiEndpoint}/{$this->categoryContentTypeTemplate->getId()}", 'PUT');
        $this->assertResponseStatusCode(405);
    }

    public function testDeleteForbidden(): void {
        $this->dispatch("{$this->apiEndpoint}/{$this->categoryContentTypeTemplate->getId()}", 'DELETE');
        $this->assertResponseStatusCode(405);
    }
}
