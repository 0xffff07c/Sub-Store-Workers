import YAML from 'static-js-yaml';

type YAMLLoadFunction = (content: string, ...args: any[]) => any;
type YAMLDumpFunction = (content: any, ...args: any[]) => string;

function retry<T extends YAMLLoadFunction>(
    fn: T,
    content: string,
    ...args: any[]
): ReturnType<T> {
    try {
        return fn(content, ...args);
    } catch (e) {
        const processedContent = content.replace(/!<str>\s*/g, '__SubStoreJSYAMLString__');
        const intermediate = fn(processedContent, ...args);
        const dumped = YAML.dump(intermediate);
        const finalContent = dumped.replace(/__SubStoreJSYAMLString__/g, '');
        return fn(finalContent, ...args);
    }
}

export function safeLoad(content: string, ...args: any[]): any {
    const sanitizedContent = JSON.parse(JSON.stringify(content));
    return retry(YAML.safeLoad, sanitizedContent, ...args);
}

export function load(content: string, ...args: any[]): any {
    const sanitizedContent = JSON.parse(JSON.stringify(content));
    return retry(YAML.load, sanitizedContent, ...args);
}

export function safeDump(content: any, ...args: any[]): string {
    const sanitizedContent = JSON.parse(JSON.stringify(content));
    return YAML.safeDump(sanitizedContent, ...args);
}

export function dump(content: any, ...args: any[]): string {
    const sanitizedContent = JSON.parse(JSON.stringify(content));
    return YAML.dump(sanitizedContent, ...args);
}

interface YAMLUtils {
    safeLoad: typeof safeLoad;
    load: typeof load;
    safeDump: typeof safeDump;
    dump: typeof dump;
}

const yamlUtils: YAMLUtils = {
    safeLoad,
    load,
    safeDump,
    dump,
};

export default yamlUtils;
