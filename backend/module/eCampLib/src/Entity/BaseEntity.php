<?php

namespace eCamp\Lib\Entity;

use Doctrine\Common\Util\ClassUtils;
use Doctrine\ORM\Mapping as ORM;
use eCamp\Lib\Types\DateTimeUtc;
use eCamp\Lib\Util\IdGenerator;
use Laminas\Permissions\Acl\Resource\ResourceInterface;

/**
 * @ORM\MappedSuperclass
 * @ORM\HasLifecycleCallbacks
 * @ORM\Table(
 *     indexes={
 *         @ORM\Index(columns={"createTime"}),
 *         @ORM\Index(columns={"updateTime"})
 *     }
 * )
 */
abstract class BaseEntity implements ResourceInterface {
    /**
     * @var string
     * @ORM\Id
     * @ORM\Column(type="string", length=16, nullable=false)
     */
    protected $id;

    /**
     * @var DateTimeUtc
     * @ORM\Column(type="datetime")
     */
    protected $createTime;

    /**
     * @var DateTimeUtc
     * @ORM\Column(type="datetime")
     */
    protected $updateTime;

    public function __construct() {
        $this->id = IdGenerator::generateRandomHexString(12);

        $this->createTime = new DateTimeUtc();
        $this->updateTime = new DateTimeUtc();
    }

    public function __toString(): string {
        return '['.$this->getClassname().'::'.$this->getId().']';
    }

    public function getResourceId(): string {
        return ClassUtils::getClass($this);
    }

    public function getId(): string {
        return $this->id;
    }

    /**
     * @ORM\PrePersist
     */
    public function PrePersist(): void {
        $this->createTime = new DateTimeUtc();
        $this->updateTime = new DateTimeUtc();
    }

    /**
     * @ORM\PreUpdate
     */
    public function PreUpdate(): void {
        $this->updateTime = new DateTimeUtc();
    }

    private function getClassname(): string {
        return ClassUtils::getClass($this);
    }
}
