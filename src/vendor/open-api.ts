/* eslint-disable no-undef */
/* eslint-disable @typescript-eslint/no-explicit-any */
/* eslint-disable @typescript-eslint/ban-ts-comment */

type HTTPMethod = 'GET' | 'POST' | 'PUT' | 'DELETE' | 'HEAD' | 'OPTIONS' | 'PATCH';
type HTTPOptions = {
    url: string;
    headers?: Record<string, string>;
    body?: string;
    timeout?: number;
    node?: string;
    opts?: any;
    events?: {
        onRequest?: (method: HTTPMethod, options: HTTPOptions) => void;
        onResponse?: (resp: HTTPResponse) => any;
        onTimeout?: () => void;
    };
    [key: string]: any;
};
type HTTPResponse = {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
};

interface Env {
    isQX: boolean;
    isLoon: boolean;
    isSurge: boolean;
    isNode: boolean;
    isStash: boolean;
    isShadowRocket: boolean;
    isEgern: boolean;
    isLanceX: boolean;
    isGUIforCores: boolean;
}

interface HTTPClient {
    get: (options: HTTPOptions | string) => Promise<HTTPResponse>;
    post: (options: HTTPOptions | string) => Promise<HTTPResponse>;
    put: (options: HTTPOptions | string) => Promise<HTTPResponse>;
    delete: (options: HTTPOptions | string) => Promise<HTTPResponse>;
    head: (options: HTTPOptions | string) => Promise<HTTPResponse>;
    options: (options: HTTPOptions | string) => Promise<HTTPResponse>;
    patch: (options: HTTPOptions | string) => Promise<HTTPResponse>;
}

interface NotificationOptions {
    'open-url'?: string;
    'media-url'?: string;
}

declare const $task: any;
declare const $loon: any;
declare const $httpClient: any;
declare const $environment: any;
declare const $persistentStore: any;
declare const $prefs: any;
declare const $notify: any;
declare const $notification: any;
declare const $Plugins: any;
declare const $context: any;
declare const $done: (options?: {}) => void;

const isQX = typeof $task !== 'undefined';
const isLoon = typeof $loon !== 'undefined';
const isSurge = typeof $httpClient !== 'undefined' && !isLoon;
// @ts-ignore
const isNode = eval(`typeof process !== "undefined"`);
const isStash = typeof $environment !== 'undefined' && $environment['stash-version'];
const isShadowRocket = typeof $rocket !== 'undefined';
const isEgern = typeof egern === 'object';
const isLanceX = typeof $native !== 'undefined';
const isGUIforCores = typeof $Plugins !== 'undefined';

export class OpenAPI {
    name: string;
    debug: boolean;
    cache: Record<string, any>;
    root: Record<string, any>;
    http: HTTPClient;
    env: Env;
    node: { fs: any } | null;

    constructor(name = 'untitled', debug = false) {
        this.name = name;
        this.debug = debug;
        this.cache = {};
        this.root = {};
        this.http = HTTP();
        this.env = ENV();
        this.node = isNode ? { fs: eval("require('fs')") } : null;
        this.initCache();

        const delay = <T>(t: number, v: T): Promise<T> =>
            new Promise(resolve => setTimeout(() => resolve(v), t));

        Promise.prototype.delay = async function <T>(t: number): Promise<T> {
            const v = await this;
            return await delay(t, v);
        };
    }

    private initCache(): void {
        if (isQX) this.cache = JSON.parse($prefs.valueForKey(this.name) || '{}');
        if (isLoon || isSurge) this.cache = JSON.parse($persistentStore.read(this.name) || '{}');
        if (isGUIforCores) this.cache = JSON.parse($Plugins.SubStoreCache.get(this.name) || '{}');
        
        if (isNode) {
            const basePath = eval('process.env.SUB_STORE_DATA_BASE_PATH') || '.';
            const rootPath = `${basePath}/root.json`;
            
            this.log(`Root path: ${rootPath}`);
            if (!this.node!.fs.existsSync(rootPath)) {
                this.node!.fs.writeFileSync(rootPath, JSON.stringify({}), { flag: 'wx' });
                this.root = {};
            } else {
                this.root = JSON.parse(this.node!.fs.readFileSync(rootPath, 'utf-8'));
            }

            const fpath = `${basePath}/${this.name}.json`;
            this.log(`Data path: ${fpath}`);
            if (!this.node!.fs.existsSync(fpath)) {
                this.node!.fs.writeFileSync(fpath, JSON.stringify({}), { flag: 'wx' });
                this.cache = {};
            } else {
                this.cache = JSON.parse(this.node!.fs.readFileSync(fpath, 'utf-8'));
            }
        }
    }

    private persistCache(): void {
        const data = JSON.stringify(this.cache, null, 2);
        if (isQX) $prefs.setValueForKey(data, this.name);
        if (isLoon || isSurge) $persistentStore.write(data, this.name);
        if (isGUIforCores) $Plugins.SubStoreCache.set(this.name, data);
        
        if (isNode) {
            const basePath = eval('process.env.SUB_STORE_DATA_BASE_PATH') || '.';
            this.node!.fs.writeFileSync(
                `${basePath}/${this.name}.json`,
                data,
                { flag: 'w' },
                (err: any) => console.log(err)
            );
            this.node!.fs.writeFileSync(
                `${basePath}/root.json`,
                JSON.stringify(this.root, null, 2),
                { flag: 'w' },
                (err: any) => console.log(err)
            );
        }
    }

    write(data: any, key: string): void {
        this.log(`SET ${key}`);
        if (key.includes('#')) {
            const cleanKey = key.substring(1);
            if (isSurge || isLoon) $persistentStore.write(data, cleanKey);
            if (isQX) $prefs.setValueForKey(data, cleanKey);
            if (isNode) this.root[cleanKey] = data;
            if (isGUIforCores) $Plugins.SubStoreCache.set(cleanKey, data);
        } else {
            this.cache[key] = data;
        }
        this.persistCache();
    }

    read(key: string): any {
        this.log(`READ ${key}`);
        if (key.includes('#')) {
            const cleanKey = key.substring(1);
            if (isSurge || isLoon) return $persistentStore.read(cleanKey);
            if (isQX) return $prefs.valueForKey(cleanKey);
            if (isNode) return this.root[cleanKey];
            if (isGUIforCores) return $Plugins.SubStoreCache.get(cleanKey);
        }
        return this.cache[key];
    }

    delete(key: string): void {
        this.log(`DELETE ${key}`);
        if (key.includes('#')) {
            const cleanKey = key.substring(1);
            if (isSurge || isLoon) $persistentStore.write(null, cleanKey);
            if (isQX) $prefs.removeValueForKey(cleanKey);
            if (isNode) delete this.root[cleanKey];
            if (isGUIforCores) $Plugins.SubStoreCache.remove(cleanKey);
        } else {
            delete this.cache[key];
        }
        this.persistCache();
    }

    notify(title: string, subtitle = '', content = '', options: NotificationOptions = {}): void {
        const openURL = options['open-url'];
        const mediaURL = options['media-url'];

        if (isQX) $notify(title, subtitle, content, options);
        if (isSurge) {
            $notification.post(
                title,
                subtitle,
                `${content}${mediaURL ? `\n多媒体:${mediaURL}` : ''}`,
                { url: openURL }
            );
        }
        if (isLoon) {
            const opts: any = {};
            if (openURL) opts.openUrl = openURL;
            if (mediaURL) opts.mediaUrl = mediaURL;
            $notification.post(title, subtitle, content, Object.keys(opts).length ? opts : undefined);
        }
        if (isNode) {
            const fullContent = [content, openURL && `点击跳转: ${openURL}`, mediaURL && `多媒体: ${mediaURL}`]
                .filter(Boolean)
                .join('\n');
            console.log(`${title}\n${subtitle}\n${fullContent}\n`);

            const pushService = eval('process.env.SUB_STORE_PUSH_SERVICE');
            if (pushService) {
                const encodedTitle = encodeURIComponent(title || 'Sub-Store');
                const encodedContent = encodeURIComponent([subtitle, fullContent].join('\n'));
                const url = pushService
                    .replace('[推送标题]', encodedTitle)
                    .replace('[推送内容]', encodedContent);
                
                this.http.get({ url })
                    .then(resp => 
                        console.log(`[Push Service] URL: ${url}\nRES: ${resp.statusCode} ${resp.body}`)
                    )
                    .catch(e => 
                        console.log(`[Push Service] URL: ${url}\nERROR: ${e}`)
                    );
            }
        }
        if (isGUIforCores) {
            $Plugins.Notify(title, `${subtitle}\n${content}`);
        }
    }

    log(msg: string): void {
        if (this.debug) console.log(`[${this.name}] LOG: ${msg}`);
    }

    info(msg: string): void {
        console.log(`[${this.name}] INFO: ${msg}`);
    }

    error(msg: string): void {
        console.log(`[${this.name}] ERROR: ${msg}`);
    }

    wait(millisec: number): Promise<void> {
        return new Promise(resolve => setTimeout(resolve, millisec));
    }

    done(value: object = {}): void {
        if (isQX || isLoon || isSurge || isGUIforCores) {
            $done(value);
        } else if (isNode && typeof $context !== 'undefined') {
            Object.assign($context, value);
        }
    }
}

export function ENV(): Env {
    return {
        isQX,
        isLoon,
        isSurge,
        isNode,
        isStash,
        isShadowRocket,
        isEgern,
        isLanceX,
        isGUIforCores,
    };
}

export function HTTP(defaultOptions: HTTPOptions = { baseURL: '' }): HTTPClient {
    const env = ENV();
    const URL_REGEX = /https?:\/\/(www\.)?[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)/;

    async function send(method: HTTPMethod, options: HTTPOptions | string): Promise<HTTPResponse> {
        let opts: HTTPOptions = typeof options === 'string' ? { url: options } : { ...options };
        
        // Merge base URL
        if (defaultOptions.baseURL && !URL_REGEX.test(opts.url)) {
            opts.url = defaultOptions.baseURL + opts.url;
        }
        opts = { ...defaultOptions, ...opts };

        const events = {
            onRequest: () => {},
            onResponse: (resp: HTTPResponse) => resp,
            onTimeout: () => {},
            ...opts.events,
        };

        events.onRequest(method, opts);

        // Handle node proxy
        if (opts.node && env.isSurge) {
            const build = $environment?.['surge-build'];
            if (build && parseInt(build) >= 2407) {
                (opts as any)['policy-descriptor'] = opts.node;
                delete opts.node;
            }
        }

        let worker: Promise<HTTPResponse>;
        if (env.isQX) {
            worker = $task.fetch({ method, ...opts });
        } else if (env.isLoon || env.isSurge || env.isNode) {
            worker = new Promise((resolve, reject) => {
                const request = env.isNode ? eval("require('request')") : $httpClient;
                request[method.toLowerCase()](opts, (err: any, response: any, body: string) => {
                    if (err) reject(err);
                    else resolve({
                        statusCode: response.status || response.statusCode,
                        headers: response.headers,
                        body
                    });
                });
            });
        } else if (env.isGUIforCores) {
            worker = $Plugins.Requests({
                method,
                url: opts.url,
                headers: opts.headers,
                body: opts.body,
                options: {
                    Proxy: (opts as any).proxy,
                    Timeout: opts.timeout ? opts.timeout / 1000 : 15
                }
            }).then((resp: any) => ({
                statusCode: resp.status,
                headers: resp.headers,
                body: resp.body
            }));
        } else {
            throw new Error('Unsupported environment');
        }

        // Handle timeout
        if (opts.timeout) {
            const timeout = opts.timeout;
            const timeoutPromise = new Promise<never>((_, reject) => 
                setTimeout(() => {
                    events.onTimeout();
                    reject(`${method} ${opts.url} timeout after ${timeout}ms`);
                }, timeout)
            );
            return Promise.race([worker, timeoutPromise]).finally(() => 
                clearTimeout(timeoutPromise as unknown as NodeJS.Timeout)
            );
        }

        return worker.then(events.onResponse);
    }

    return {
        get: (options) => send('GET', options),
        post: (options) => send('POST', options),
        put: (options) => send('PUT', options),
        delete: (options) => send('DELETE', options),
        head: (options) => send('HEAD', options),
        options: (options) => send('OPTIONS', options),
        patch: (options) => send('PATCH', options),
    };
}
