import { CACHE_EXPIRATION_TIME_MS, RESOURCE_CACHE_KEY } from '../constants';
import { DB } from '../db';

class ResourceCache {
    expires: number;

    constructor(expires: number) {
        this.expires = expires;
        this.cleanup().catch((err) => {
            console.error('ResourceCache initialization cleanup failed:', err);
        });
    }

    private async cleanup(): Promise<void> {
        const cutoffTime = new Date().getTime() - this.expires;
        await DB
            .deleteFrom(RESOURCE_CACHE_KEY)
            .where('time', '<=', cutoffTime)
            .execute();
    }

    async revokeAll(): Promise<void> {
        await DB
            .deleteFrom(RESOURCE_CACHE_KEY)
            .execute();
    }

    async get(key: string): Promise<any> {
        const cutoffTime = new Date().getTime() - this.expires;
        const result = await DB
            .selectFrom(RESOURCE_CACHE_KEY)
            .selectAll()
            .where('key', '=', key)
            .where('time', '>', cutoffTime)
            .executeTakeFirst();
        
        return result ? JSON.parse(result.data) : null;
    }

    async set(key: string, data: any): Promise<void> {
        const time = new Date().getTime();
        const dataString = JSON.stringify(data);
        await DB
            .insertInto(RESOURCE_CACHE_KEY)
            .values({ key, data: dataString, time })
            .onConflict((oc) => 
                oc.column('key').doUpdateSet({ data: dataString, time })
            )
            .execute();
    }
}

export default new ResourceCache(CACHE_EXPIRATION_TIME_MS);
