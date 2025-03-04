/* eslint-disable no-undef */
import { ENV, type EnvType } from './open-api';

interface Substore {
    info: (msg: string) => void;
    [key: string]: any;
}

interface ExpressOptions {
    substore: Substore;
    port: number;
    host: string;
}

interface Handler {
    method: string;
    pattern: string | RegExp;
    callback: (req: Request, res: Response, next: () => void) => void | Promise<void>;
}

interface Request {
    method: string;
    url: string;
    path: string;
    query: Record<string, string>;
    params: Record<string, string> | null;
    headers: Record<string, string>;
    body: any;
}

interface Response {
    status(code: number): Response;
    send(body?: string | object): void;
    end(): void;
    html(data: string): void;
    json(data: object): void;
    set(key: string, value: string): Response;
}

interface App {
    [method: string]: (pattern: string | RegExp, callback: Handler['callback']) => void;
    route: (pattern: string | RegExp) => any;
    start: () => void;
}

const DEFAULT_HEADERS: Record<string, string> = {
    'Content-Type': 'text/plain;charset=UTF-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST,GET,OPTIONS,PATCH,PUT,DELETE',
    'Access-Control-Allow-Headers': 'Origin, X-Requested-With, Content-Type, Accept',
    'X-Powered-By': 'Sub-Store',
};

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD', 'ALL'] as const;
type HttpMethod = typeof HTTP_METHODS[number];

export default function express({ substore: $, port, host }: ExpressOptions): App {
    const { isNode } = ENV();
    const handlers: Handler[] = [];

    // Node.js 支持
    if (isNode) {
        const express_ = eval(`require("express")`) as typeof import('express');
        const bodyParser = eval(`require("body-parser")`) as typeof import('body-parser');
        const app = express_() as import('express').Express & { start?: () => void };
        
        app.use(bodyParser.json({ verify: rawBodySaver, limit: '1mb' }));
        app.use(bodyParser.urlencoded({ verify: rawBodySaver, extended: true }));
        app.use(bodyParser.raw({ verify: rawBodySaver, type: '*/*' }));
        
        app.use((_, res, next) => {
            res.set(DEFAULT_HEADERS);
            next();
        });

        app.start = () => {
            const listener = app.listen(port, host, () => {
                const address = listener.address();
                const addr = typeof address === 'string' ? address : `${address?.address}:${address?.port}`;
                $.info(`[BACKEND] ${addr}`);
            });
        };
        return app as unknown as App;
    }

    // 请求分发逻辑
    const dispatch = (request: any, start = 0) => {
        let { method, url, headers, body } = request;
        headers = formatHeaders(headers);
        
        if (/json/i.test(headers['content-type'])) {
            try {
                body = JSON.parse(body);
            } catch (e) {
                console.error('JSON parse error:', e);
            }
        }

        method = method.toUpperCase();
        const { path, query } = extractURL(url);

        // 路由匹配逻辑
        let matchedHandler: Handler | null = null;
        let longestMatchLength = 0;

        for (let i = start; i < handlers.length; i++) {
            const handler = handlers[i];
            if (handler.method === 'ALL' || method === handler.method) {
                if (patternMatched(handler.pattern, path)) {
                    const patternLength = handler.pattern.toString().split('/').length;
                    if (patternLength > longestMatchLength) {
                        matchedHandler = handler;
                        longestMatchLength = patternLength;
                    }
                }
            }
        }

        if (matchedHandler) {
            const next = () => dispatch(request, handlers.indexOf(matchedHandler!) + 1);
            const req: Request = {
                method,
                url,
                path,
                query,
                params: extractPathParams(matchedHandler.pattern, path),
                headers,
                body
            };
            const res = createResponse();
            
            const errorHandler = (err: Error) => {
                res.status(500).json({
                    status: 'failed',
                    message: `Internal Server Error: ${err.message}`
                });
            };

            try {
                const result = matchedHandler.callback(req, res, next);
                if (result instanceof Promise) {
                    result.catch(errorHandler);
                }
            } catch (err) {
                errorHandler(err as Error);
            }
        } else {
            const res = createResponse();
            res.status(404).json({
                status: 'failed',
                message: 'ERROR: 404 not found'
            });
        }
    };

    // 创建应用对象
    const app: App = {
        route: (pattern) => {
            const chain: any = {};
            HTTP_METHODS.forEach(method => {
                chain[method.toLowerCase()] = (callback: Handler['callback']) => {
                    handlers.push({ method, pattern, callback });
                    return chain;
                };
            });
            return chain;
        },
        start: () => {
            dispatch($request);
        }
    } as App;

    // 添加 HTTP 方法
    HTTP_METHODS.forEach(method => {
        app[method.toLowerCase()] = (pattern: string | RegExp, callback: Handler['callback']) => {
            handlers.push({ method, pattern, callback });
        };
    });

    return app;

    /***************************** 工具函数 *****************************/
    function rawBodySaver(req: any, _res: any, buf: Buffer, encoding: BufferEncoding) {
        if (buf && buf.length) {
            req.rawBody = buf.toString(encoding);
        }
    }

    function createResponse(): Response {
        let statusCode = 200;
        const headers: Record<string, string> = { ...DEFAULT_HEADERS };
        const { isQX, isLoon, isSurge, isGUIforCores } = ENV();

        const STATUS_MAP: Record<number, string> = {
            200: 'HTTP/1.1 200 OK',
            201: 'HTTP/1.1 201 Created',
            302: 'HTTP/1.1 302 Found',
            307: 'HTTP/1.1 307 Temporary Redirect',
            308: 'HTTP/1.1 308 Permanent Redirect',
            404: 'HTTP/1.1 404 Not Found',
            500: 'HTTP/1.1 500 Internal Server Error',
        };

        return {
            status(code: number) {
                statusCode = code;
                return this;
            },

            send(body?: string | object) {
                const response = {
                    status: isQX ? STATUS_MAP[statusCode] : statusCode,
                    headers,
                    body: typeof body === 'object' ? JSON.stringify(body) : body
                };

                if (isQX || isGUIforCores) {
                    $done(response);
                } else if (isLoon || isSurge) {
                    $done({ response });
                }
            },

            end() {
                this.send();
            },

            html(data: string) {
                this.set('Content-Type', 'text/html;charset=UTF-8').send(data);
            },

            json(data: object) {
                this.set('Content-Type', 'application/json;charset=UTF-8').send(data);
            },

            set(key: string, value: string) {
                headers[key.toLowerCase()] = value;
                return this;
            }
        };
    }
}

// 辅助函数
function formatHeaders(headers: Record<string, string>): Record<string, string> {
    return Object.entries(headers).reduce((acc, [key, value]) => {
        acc[key.toLowerCase()] = value;
        return acc;
    }, {} as Record<string, string>);
}

function patternMatched(pattern: string | RegExp, path: string): boolean {
    if (pattern instanceof RegExp) {
        return pattern.test(path);
    }
    
    if (pattern === '/') return true;
    
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    
    if (patternParts.length > pathParts.length) return false;
    
    for (let i = 0; i < patternParts.length; i++) {
        if (patternParts[i].startsWith(':')) continue;
        if (patternParts[i] !== pathParts[i]) return false;
    }
    
    return true;
}

function extractURL(url: string): { path: string; query: Record<string, string> } {
    const urlObj = new URL(url);
    const query: Record<string, string> = {};
    urlObj.searchParams.forEach((value, key) => query[key] = value);
    
    return {
        path: urlObj.pathname,
        query
    };
}

function extractPathParams(pattern: string | RegExp, path: string): Record<string, string> | null {
    if (pattern instanceof RegExp) return null;
    
    const params: Record<string, string> = {};
    const patternParts = pattern.split('/');
    const pathParts = path.split('/');
    
    if (patternParts.length !== pathParts.length) return null;
    
    for (let i = 0; i < patternParts.length; i++) {
        const part = patternParts[i];
        if (part.startsWith(':')) {
            const paramName = part.slice(1);
            params[paramName] = pathParts[i];
        } else if (part !== pathParts[i]) {
            return null;
        }
    }
    
    return params;
}
