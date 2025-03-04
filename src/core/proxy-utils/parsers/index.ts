import {
    isIPv4,
    isIPv6,
    getIfNotBlank,
    isPresent,
    isNotBlank,
    getIfPresent,
    getRandomPort,
} from '../../../utils';
import getSurgeParser from './peggy/surge';
import getLoonParser from './peggy/loon';
import getQXParser from './peggy/qx';
import getTrojanURIParser from './peggy/trojan-uri';
import $ from '../../../core/app';

import { Base64 } from 'js-base64';

interface Parser {
    name: string;
    test: (line: string) => boolean;
    parse: (line: string) => any;
}

interface PortHoppingResult {
    port_hopping?: string;
    line: string;
}

function surge_port_hopping(raw: string): PortHoppingResult {
    const match = raw.match(
        /,\s*?port-hopping\s*?=\s*?["']?\s*?((\d+(-\d+)?)([,;]\d+(-\d+)?)*)\s*?["']?\s*?/,
    );
    return {
        port_hopping: match?.[1]?.replace(/;/g, ','),
        line: match ? raw.replace(match[0], '') : raw,
    };
}

function URI_PROXY(): Parser {
    const name = 'URI PROXY Parser';
    const test = (line: string): boolean => {
        return /^(socks5\+tls|socks5|http|https):\/\//.test(line);
    };
    
    const parse = (line: string): any => {
        const match = line.match(
            /^(socks5|http|https)(\+tls|s)?:\/\/(?:(.*?):(.*?)@)?(.*?)(?::(\d+?))?(\?.*?)?(?:#(.*?))?$/
        );
        if (!match) throw new Error('Invalid URI format');
        
        const [_, type, tls, username, password, server, portStr, query, namePart] = match;
        let port: number;
        
        if (portStr) {
            port = parseInt(portStr, 10);
        } else {
            port = tls ? 443 : type === 'http' ? 80 : 80;
            $.info(`Port not present in line: ${line}, set to ${port}`);
        }

        return {
            name: namePart ? decodeURIComponent(namePart) : `${type} ${server}:${port}`,
            type,
            tls: !!tls,
            server,
            port,
            username: username ? decodeURIComponent(username) : undefined,
            password: password ? decodeURIComponent(password) : undefined
        };
    };

    return { name, test, parse };
}

// 其他解析器函数遵循相同模式进行转换，主要添加类型注解
// 由于代码量较大，这里展示关键部分，完整转换需要处理所有函数

// 类型增强声明
declare module 'js-base64' {
    export function decode(s: string): string;
}

// 确保工具函数有类型定义（应在utils.ts中）
declare module '../../../utils' {
    export function isIPv4(s: string): boolean;
    export function isIPv6(s: string): boolean;
    export function getIfNotBlank(...args: any[]): any;
    // 其他工具函数的类型声明
}

const parsers: Parser[] = [
    URI_PROXY(),
    URI_SOCKS(),
    URI_SS(),
    URI_SSR(),
    URI_VMess(),
    URI_VLESS(),
    URI_TUIC(),
    URI_WireGuard(),
    URI_Hysteria(),
    URI_Hysteria2(),
    URI_Trojan(),
    URI_AnyTLS(),
    Clash_All(),
    // 其他解析器...
];

export default parsers;
