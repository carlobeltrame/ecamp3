<?php

namespace eCamp\ContentType\SingleText\Test;

use Doctrine\Common\DataFixtures\Loader;
use eCamp\ContentType\SingleText\Entity\SingleText;
use eCamp\ContentType\SingleText\Service\SingleTextService;
use eCamp\Core\Entity\Activity;
use eCamp\Core\Entity\Camp;
use eCamp\Core\Entity\Category;
use eCamp\Core\Entity\ContentNode;
use eCamp\Core\Entity\User;
use eCamp\Core\EntityService\ActivityService;
use eCamp\Core\EntityService\CategoryService;
use eCamp\Core\EntityService\ContentNodeService;
use eCamp\CoreTest\Data\CampTestData;
use eCamp\CoreTest\Data\ContentTypeTestData;
use eCamp\CoreTest\Data\UserTestData;
use eCamp\LibTest\PHPUnit\AbstractApiControllerTestCase;

/**
 * @internal
 */
class SingleTextStrategyTest extends AbstractApiControllerTestCase {
    /** @var User */
    protected $user;

    /** @var Camp */
    protected $camp;

    /** @var Category */
    protected $category;

    /** @var SingleText */
    protected $categorySingleText;

    private $apiEndpoint = '/api/content-type/singletexts';

    public function setUp(): void {
        parent::setUp();

        $userLoader = new UserTestData();
        $campLoader = new CampTestData();
        $contentTypeLoader = new ContentTypeTestData();

        $loader = new Loader();
        $loader->addFixture($userLoader);
        $loader->addFixture($campLoader);
        $loader->addFixture($contentTypeLoader);
        $this->loadFixtures($loader);

        $this->user = $userLoader->getReference(UserTestData::$USER1);
        $this->camp = $campLoader->getReference(CampTestData::$CAMP1);

        $this->authenticateUser($this->user);

        ///---------------------------------------------
        /// Create Category with ContentNode SingleText
        ///---------------------------------------------

        /** @var CategoryService $categoryService */
        $categoryService = $this->getApplicationServiceLocator()->get(CategoryService::class);
        /** @var ContentNodeService $contentNodeService */
        $contentNodeService = $this->getApplicationServiceLocator()->get(ContentNodeService::class);
        /** @var SingleTextService $singleTextService */
        $singleTextService = $this->getApplicationServiceLocator()->get(SingleTextService::class);

        // @var Category $category
        $this->category = $categoryService->create((object) [
            'campId' => $this->camp->getId(),
            'short' => 'NC',
            'name' => 'NewCategory',
            'color' => '#AAAAAA',
            'numberingStyle' => '1',
            'createRootContentNode' => false,
        ]);

        /** @var ContentNode $categoryContentNode */
        $categoryContentNode = $contentNodeService->create((object) [
            'ownerId' => $this->category->getId(),
            'contentTypeName' => 'SingleText',
        ]);
        $this->categorySingleText = $singleTextService->findOneByContentNode($categoryContentNode->getId());

        $singleTextService->patch($this->categorySingleText->getId(), (object) [
            'text' => 'TestText',
        ]);
    }

    public function testExtract(): void {
        $this->dispatch("{$this->apiEndpoint}/{$this->categorySingleText->getId()}", 'GET');

        $this->assertResponseStatusCode(200);

        $expectedBody = <<<JSON
            {
                "id": "{$this->categorySingleText->getId()}",
                "text": "TestText"
            }
        JSON;

        $expectedLinks = <<<JSON
            {
                "self": { 
                    "href": "http://{$this->host}{$this->apiEndpoint}/{$this->categorySingleText->getId()}"
                },
                "contentNode": {
                    "href": "http://{$this->host}/api/content-nodes/{$this->category->getRootContentNode()->getId()}"
                }
            }
        JSON;

        $expectedEmbeddedObjects = [];

        $this->verifyHalResourceResponse($expectedBody, $expectedLinks, $expectedEmbeddedObjects);
    }

    public function testCreateFromPrototype(): void {
        /** @var ActivityService $activityService */
        $activityService = $this->getApplicationServiceLocator()->get(ActivityService::class);
        /** @var SingleTextService $singleTextService */
        $singleTextService = $this->getApplicationServiceLocator()->get(SingleTextService::class);

        /// Create Activity from Category
        ///-------------------------------

        /** @var Activity $activity */
        $activity = $activityService->create((object) [
            'categoryId' => $this->category->getId(),
            'title' => 'NewActivity',
        ]);

        $this->assertNotNull($activity);

        $activityContentNode = $activity->getRootContentNode();
        $this->assertNotNull($activityContentNode);

        /** @var SingleText $activitySingleText */
        $activitySingleText = $singleTextService->findOneByContentNode($activityContentNode);
        $this->assertEquals('TestText', $activitySingleText->getText());
    }
}
