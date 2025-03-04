import $ from '../core/app';
import { SCRIPT_RESOURCE_CACHE_KEY, CSR_EXPIRATION_TIME_KEY } from '../constants';

interface CacheEntry {
    time: number;
    data: any;
}

interface CacheStore {
    [key: string]: CacheEntry;
}

class ResourceCache {
    private expires: number;
    private resourceCache: CacheStore;

    constructor() {
        this.expires = this.getExpiredTime();
        
        if (!$.read(SCRIPT_RESOURCE_CACHE_KEY)) {
            $.write('{}', SCRIPT_RESOURCE_CACHE_KEY);
        }
        
        try {
            this.resourceCache = JSON.parse($.read(SCRIPT_RESOURCE_CACHE_KEY) || '{}');
        } catch (e) {
            const errorMsg = e instanceof Error ? e.message : String(e);
            $.error(`解析持久化缓存中的 ${SCRIPT_RESOURCE_CACHE_KEY} 失败, 重置为 {}, 错误: ${errorMsg}`);
            this.resourceCache = {};
            $.write('{}', SCRIPT_RESOURCE_CACHE_KEY);
        }
        
        this._cleanup();
    }

    private _cleanup(prefix?: string, expires?: number): void {
        let clear = false;
        const now = Date.now();
        
        Object.entries(this.resourceCache).forEach(([id, entry]) => {
            if (!entry.time) {
                // 清除旧版本缓存
                delete this.resourceCache[id];
                $.delete(`#${id}`);
                clear = true;
            }
            
            const expirationCheck = now - entry.time > (expires ?? this.expires);
            const prefixMatch = prefix && id.startsWith(prefix);
            
            if (expirationCheck || prefixMatch) {
                delete this.resourceCache[id];
                clear = true;
            }
        });
        
        if (clear) this._persist();
    }

    revokeAll(): void {
        this.resourceCache = {};
        this._persist();
    }

    private _persist(): void {
        $.write(JSON.stringify(this.resourceCache), SCRIPT_RESOURCE_CACHE_KEY);
    }

    get(id: string, expires?: number, remove = false): any | null {
        const entry = this.resourceCache[id];
        if (!entry) return null;

        const isValid = Date.now() - entry.time <= (expires ?? this.expires);
        if (isValid) return entry.data;

        if (remove) {
            delete this.resourceCache[id];
            this._persist();
        }
        return null;
    }

    gettime(id: string): number | null {
        const entry = this.resourceCache[id];
        if (entry && Date.now() - entry.time <= this.expires) {
            return entry.time;
        }
        return null;
    }

    set(id: string, value: any): void {
        this.resourceCache[id] = {
            time: Date.now(),
            data: value
        };
        this._persist();
    }

    private getExpiredTime(): number {
        const DEFAULT_EXPIRATION = 1728e5; // 48 hours
        
        if (!$.read(CSR_EXPIRATION_TIME_KEY)) {
            $.write(DEFAULT_EXPIRATION.toString(), CSR_EXPIRATION_TIME_KEY);
        }

        if ($.env.isLoon) {
            const loonTimeMap: Record<string, number | string> = {
                '1分钟': 6e4,
                '5分钟': 3e5,
                '10分钟': 6e5,
                '30分钟': 18e5,
                '1小时': 36e5,
                '2小时': 72e5,
                '3小时': 108e5,
                '6小时': 216e5,
                '12小时': 432e5,
                '24小时': 864e5,
                '48小时': 1728e5,
                '72小时': 2592e5,
                '参数输入': 'readcachets'
            };

            const cacheKey = $.read('#节点缓存有效期') || '48小时';
            const expiration = loonTimeMap[cacheKey];

            if (typeof expiration === 'number') return expiration;
            if (expiration === 'readcachets') return parseInt(cacheKey) || DEFAULT_EXPIRATION;
            
            return DEFAULT_EXPIRATION;
        }

        const storedValue = $.read(CSR_EXPIRATION_TIME_KEY);
        return storedValue ? parseInt(storedValue) : DEFAULT_EXPIRATION;
    }
}

export default new ResourceCache();
