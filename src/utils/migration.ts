import {
    SUBS_KEY,
    COLLECTIONS_KEY,
    SCHEMA_VERSION_KEY,
    ARTIFACTS_KEY,
    RULES_KEY,
} from '../constants';
import $ from '../core/app';

// 类型定义
interface Process {
    type: string;
    args?: any;
}

interface MigrationItem {
    source?: string;
    displayName?: string;
    'display-name'?: string;
    process?: Process[];
    [key: string]: any;
}

interface QuickSettingArgs {
    udp: string;
    tfo: string;
    scert: string;
    'vmess aead': string;
    useless: string;
}

export default function migrate(): void {
    migrateV2();
}

function migrateV2(): void {
    const version = $.read(SCHEMA_VERSION_KEY);
    if (!version) doMigrationV2();

    if (version !== '2.0') {
        $.write('2.0', SCHEMA_VERSION_KEY);
    }
}

function doMigrationV2(): void {
    $.info('Start migrating...');
    
    // 1. Migrate subscriptions
    const subs = $.read<Record<string, MigrationItem>>(SUBS_KEY) || {};
    const newSubs = Object.values(subs).map(sub => {
        sub.source = sub.source || 'remote';
        migrateDisplayName(sub);
        migrateProcesses(sub);
        return sub;
    });
    $.write(newSubs, SUBS_KEY);

    // 2. Migrate collections
    const collections = $.read<Record<string, MigrationItem>>(COLLECTIONS_KEY) || {};
    const newCollections = Object.values(collections).map(collection => {
        delete collection.ua;
        migrateDisplayName(collection);
        migrateProcesses(collection);
        return collection;
    });
    $.write(newCollections, COLLECTIONS_KEY);

    // 3. Migrate artifacts
    const artifacts = $.read<Array<any>>(ARTIFACTS_KEY) || [];
    $.write(artifacts, ARTIFACTS_KEY);

    // 4. Migrate rules
    const rules = $.read<Array<any>>(RULES_KEY) || [];
    $.write(rules, RULES_KEY);

    // 5. Delete builtin rules
    delete $.cache.builtin;
    $.info('Migration complete!');
}

function migrateDisplayName(item: MigrationItem): void {
    const displayName = item['display-name'];
    if (displayName) {
        item.displayName = displayName;
        delete item['display-name'];
    }
}

function migrateProcesses(item: MigrationItem): void {
    const processes = item.process || [];
    if (processes.length === 0) return;

    const quickSettingOperator: Process = {
        type: 'Quick Setting Operator',
        args: {
            udp: 'DEFAULT',
            tfo: 'DEFAULT',
            scert: 'DEFAULT',
            'vmess aead': 'DEFAULT',
            useless: 'DEFAULT',
        } as QuickSettingArgs
    };

    const newProcesses = processes.reduce((acc: Process[], p: Process) => {
        if (!p.type) return acc;

        if (p.type === 'Useless Filter') {
            (quickSettingOperator.args as QuickSettingArgs).useless = 'ENABLED';
        } else if (p.type === 'Set Property Operator') {
            const { key, value } = p.args || {};
            const args = quickSettingOperator.args as QuickSettingArgs;

            switch (key) {
                case 'udp':
                    args.udp = value ? 'ENABLED' : 'DISABLED';
                    break;
                case 'tfo':
                    args.tfo = value ? 'ENABLED' : 'DISABLED';
                    break;
                case 'skip-cert-verify':
                    args.scert = value ? 'ENABLED' : 'DISABLED';
                    break;
                case 'aead':
                    args['vmess aead'] = value ? 'ENABLED' : 'DISABLED';
                    break;
            }
        } else if (p.type.includes('Keyword')) {
            // Drop keyword operators and filters
        } else if (p.type === 'Flag Operator') {
            const add = p.args === undefined ? true : p.args;
            acc.push({
                type: p.type,
                args: { mode: add ? 'add' : 'remove' }
            });
        } else {
            acc.push(p);
        }
        return acc;
    }, []);

    item.process = [quickSettingOperator, ...newProcesses];
}
