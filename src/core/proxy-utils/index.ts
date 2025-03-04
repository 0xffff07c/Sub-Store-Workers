import { Buffer } from 'node:buffer';
import rs from '../../utils/rs';
import YAML from '../../utils/yaml';
import download from '../../utils/download';
import {
    isIPv4,
    isIPv6,
    isValidPortNumber,
    isValidUUID,
    isNotBlank,
    ipAddress,
    getRandomPort,
    numberToString,
} from '../../utils';
import PROXY_PROCESSORS, { ApplyProcessor } from './processors';
import PROXY_PREPROCESSORS from './preprocessors';
import PROXY_PRODUCERS from './producers';
import PROXY_PARSERS from './parsers';
import $ from '../../core/app';
import { FILES_KEY, MODULES_KEY } from '../../constants';
import { findByName } from '../../utils/database';
import { produceArtifact } from '../../restful/sync';
import { getFlag, removeFlag, getISO, MMDB } from '../../utils/geo';
import Gist from '../../utils/gist';
import { isPresent } from './producers/utils';
import { doh } from '../../utils/dns';

// 类型定义
interface Proxy {
    type: string;
    name?: string;
    server: string;
    port?: number | string;
    [key: string]: any;
}

interface ProcessorArgs {
    [key: string]: any;
}

interface ScriptArgs {
    mode?: string;
    content?: string;
    arguments?: ProcessorArgs;
}

interface ProcessorItem {
    type: string;
    disabled?: boolean;
    args?: ScriptArgs;
}

interface ProducerOptions {
    type?: string;
    [key: string]: any;
}

// 预处理函数
function preprocess(raw: string): string {
    for (const processor of PROXY_PREPROCESSORS) {
        try {
            if (processor.test(raw)) {
                $.info(`Pre-processor [${processor.name}] activated`);
                return processor.parse(raw);
            }
        } catch (e) {
            const error = e instanceof Error ? e : new Error(String(e));
            $.error(`Parser [${processor.name}] failed\n Reason: ${error.message}`);
        }
    }
    return raw;
}

// 解析函数
function parse(raw: string): Proxy[] {
    const processedRaw = preprocess(raw);
    const lines = processedRaw.split('\n');
    const proxies: Proxy[] = [];
    let lastParser: any = null;

    for (let line of lines) {
        line = line.trim();
        if (line.length === 0) continue;

        let success = false;
        let parsedProxy: Proxy | null = null;

        // 尝试使用最后成功的解析器
        if (lastParser) {
            try {
                parsedProxy = lastParser.parse(line);
                success = true;
            } catch (e) {
                // 忽略错误继续尝试其他解析器
            }
        }

        // 尝试所有解析器
        if (!success) {
            for (const parser of PROXY_PARSERS) {
                if (parser.test(line)) {
                    try {
                        parsedProxy = parser.parse(line);
                        lastParser = parser;
                        success = true;
                        $.info(`${parser.name} is activated`);
                        break;
                    } catch (e) {
                        // 继续尝试下一个解析器
                    }
                }
            }
        }

        if (success && parsedProxy) {
            proxies.push(lastParse(parsedProxy));
        } else {
            $.error(`Failed to parse line: ${line}`);
        }
    }

    return proxies.filter(proxy => {
        if (['vless', 'vmess'].includes(proxy.type)) {
            const isValid = isValidUUID(proxy.uuid);
            if (!isValid) {
                $.error(`UUID may be invalid: ${proxy.name} ${proxy.uuid}`);
            }
            return isValid;
        }
        return true;
    });
}

// 处理函数
async function processFn(
    proxies: Proxy[],
    operators: ProcessorItem[] = [],
    targetPlatform: string,
    source: string,
    $options: any
): Promise<Proxy[]> {
    for (const item of operators) {
        if (item.disabled) {
            $.log(`Skipping disabled operator: "${item.type}"`);
            continue;
        }

        let script: string | undefined;
        let $arguments: ProcessorArgs = {};

        // 脚本处理逻辑
        if (item.type.includes('Script')) {
            const { mode = 'inline', content = '' } = item.args || {};
            if (mode === 'link') {
                // URL 处理逻辑
                let url = content.split('#')[0];
                const noCache = content.endsWith('#noCache');

                // 参数解析
                const hashParts = content.split('#').slice(1);
                if (hashParts.length > 0) {
                    try {
                        $arguments = JSON.parse(decodeURIComponent(hashParts[0]));
                    } catch {
                        hashParts[0].split('&').forEach(pair => {
                            const [key, value] = pair.split('=');
                            $arguments[key] = value || true;
                        });
                    }
                }

                // 资源加载逻辑
                const match = url.match(/^\/api\/(file|module)\/(.+)/);
                if (match) {
                    const [_, type, encodedName] = match;
                    const name = decodeURIComponent(encodedName);
                    const key = type === 'module' ? MODULES_KEY : FILES_KEY;
                    const resource = findByName($.read(key), name);

                    if (!resource) throw new Error(`${type} not found: ${name}`);
                    
                    script = type === 'module' 
                        ? resource.content
                        : await produceArtifact({ type: 'file', name });
                } else {
                    try {
                        script = await download(noCache ? `${url}#noCache` : url);
                    } catch (e) {
                        throw new Error(`Download failed: ${url}`);
                    }
                }
            } else {
                script = content;
                $arguments = item.args?.arguments || {};
            }
        }

        // 处理器应用
        const processor = PROXY_PROCESSORS[item.type]
            ? PROXY_PROCESSORS[item.type](item.args || {})
            : null;

        if (processor) {
            $.log(`Applying "${item.type}"`);
            proxies = await ApplyProcessor(processor, proxies);
        }
    }

    return proxies;
}

// 生产函数
function produce(
    proxies: Proxy[],
    targetPlatform: string,
    type: string,
    opts: ProducerOptions = {}
): string | string[] {
    const producer = PROXY_PRODUCERS[targetPlatform];
    if (!producer) throw new Error(`Unsupported platform: ${targetPlatform}`);

    // 过滤和预处理代理
    const processedProxies = proxies
        .filter(proxy => {
            if (proxy.supported?.[targetPlatform] === false) return false;
            return ['vless', 'vmess'].includes(proxy.type) 
                ? isValidUUID(proxy.uuid)
                : true;
        })
        .map(proxy => ({
            ...proxy,
            _resolved: proxy.resolved,
            name: proxy.name || `${proxy.type} ${proxy.server}:${proxy.port}`
        }));

    // 生产输出
    if (producer.type === 'SINGLE') {
        return processedProxies
            .map(proxy => {
                try {
                    return producer.produce(proxy, type, opts);
                } catch (e) {
                    $.error(`Production error: ${e}`);
                    return '';
                }
            })
            .filter(line => line);
    }

    return producer.produce(processedProxies, type, opts);
}

// 工具函数
const ProxyUtils = {
    parse,
    process: processFn,
    produce,
    ipAddress,
    getRandomPort,
    isIPv4,
    isIPv6,
    isIP: (ip: string) => isIPv4(ip) || isIPv6(ip),
    yaml: YAML,
    getFlag,
    removeFlag,
    getISO,
    MMDB,
    Gist,
    download,
    isValidUUID,
    doh,
};

export default ProxyUtils;

// 辅助函数（需要补充完整实现）
function lastParse(proxy: Proxy): Proxy {
    // 保持原有处理逻辑
    return proxy;
}
