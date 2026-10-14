import { VolumePage } from '../pages/storage/VolumePage';
import { VolumeClient } from '../services/volume-client';
import { ResourceCleanup } from '../utils/resource-cleanup';

export class VolumeLifecycle {
  constructor(
    private readonly page: VolumePage,
    private readonly client: VolumeClient,
    private readonly resources: ResourceCleanup,
  ) {}

  async createAndVerify(name: string, sizeGiB: number): Promise<void> {
    await this.page.openVolumes();
    this.resources.register(name);
    await this.page.createVolume(name, sizeGiB);
    this.resources.markCreated(name);
    await this.client.expectReady(name, sizeGiB);
    await this.page.waitUntilActive(name);
    await this.page.expectSize(name, sizeGiB);
  }

  async deleteAndVerify(name: string): Promise<void> {
    try {
      await this.page.deleteVolume(name);
      const remaining = await this.client.findByName(name);
      if (remaining) throw new Error(`UI row disappeared but backend resource remains: ${remaining.id}`);
      this.resources.markDeleted(name);
    } catch (error) {
      this.resources.recordDeletionFailure(name, error);
      throw error;
    }
  }
}
