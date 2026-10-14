import { expect, type APIRequestContext } from '@playwright/test';

export type Volume = { id: string; name: string; sizeGiB: number; status: string; bootable: boolean };

/** Contract of demo/server.mjs, not a production Cinder API adapter. */
export class VolumeClient {
  private readonly collectionPath = '/api/v1/volumes';
  constructor(private readonly request: APIRequestContext) {}

  async findByName(name: string): Promise<Volume | undefined> {
    const response = await this.request.get(this.collectionPath, { params: { name } });
    expect(response.status(), 'Volume list API must succeed before deciding cleanup').toBe(200);
    const volumes: Volume[] = await response.json();
    expect(Array.isArray(volumes), 'Volume list must be an array').toBe(true);
    const matches = volumes.filter(volume => volume.name === name);
    expect(matches.length, `Unique name expected: ${name}`).toBeLessThanOrEqual(1);
    return matches[0];
  }

  async expectReady(name: string, sizeGiB: number): Promise<void> {
    const volume = await this.findByName(name);
    expect(volume, 'Backend identity, size, status and bootable must match').toMatchObject({
      name, sizeGiB, status: 'ACTIVE', bootable: true,
    });
  }

  async deleteByName(name: string): Promise<void> {
    const volume = await this.findByName(name);
    if (!volume) return;
    const response = await this.request.delete(`${this.collectionPath}/${encodeURIComponent(volume.id)}`);
    expect(response.status(), `Delete volume ${volume.id}`).toBe(204);
    expect(await this.findByName(name), 'Backend must confirm deletion').toBeUndefined();
  }
}
