import gte from 'semver/functions/gte';
import coerce from 'semver/functions/coerce';
import $ from '../core/app';

type Platform = 
  | 'QX'
  | 'Egern'
  | 'Surfboard'
  | 'SurgeMac'
  | 'Surge'
  | 'Loon'
  | 'Shadowrocket'
  | 'Stash'
  | 'ClashMeta'
  | 'Clash'
  | 'V2Ray'
  | 'sing-box'
  | 'JSON';

interface UserAgentInfo {
  UA: string;
  ua: string;
  accept: string;
}

export function getUserAgentFromHeaders(headers: Record<string, string>): UserAgentInfo {
  const keys = Object.keys(headers);
  let UA = '';
  let ua = '';
  let accept = '';
  
  for (const k of keys) {
    const lower = k.toLowerCase();
    const value = headers[k];
    
    if (lower === 'user-agent') {
      UA = value;
      ua = UA.toLowerCase();
    } else if (lower === 'accept') {
      accept = value;
    }
  }
  
  return { UA, ua, accept };
}

export function getPlatformFromUserAgent({ ua, UA, accept }: UserAgentInfo): Platform {
  if (UA.includes('Quantumult%20X')) {
    return 'QX';
  }
  if (ua.includes('egern')) {
    return 'Egern';
  }
  if (UA.includes('Surfboard')) {
    return 'Surfboard';
  }
  if (UA.includes('Surge Mac')) {
    return 'SurgeMac';
  }
  if (UA.includes('Surge')) {
    return 'Surge';
  }
  if (UA.includes('Decar') || UA.includes('Loon')) {
    return 'Loon';
  }
  if (UA.includes('Shadowrocket')) {
    return 'Shadowrocket';
  }
  if (UA.includes('Stash')) {
    return 'Stash';
  }
  if (
    ua === 'meta' ||
    (ua.includes('clash') && ua.includes('meta')) ||
    ua.includes('clash-verge') ||
    ua.includes('flclash')
  ) {
    return 'ClashMeta';
  }
  if (ua.includes('clash')) {
    return 'Clash';
  }
  if (ua.includes('v2ray')) {
    return 'V2Ray';
  }
  if (ua.includes('sing-box')) {
    return 'sing-box';
  }
  if (accept.startsWith('application/json')) {
    return 'JSON';
  }
  return 'V2Ray';
}

export function getPlatformFromHeaders(headers: Record<string, string>): Platform {
  const { UA, ua, accept } = getUserAgentFromHeaders(headers);
  return getPlatformFromUserAgent({ ua, UA, accept });
}

export function shouldIncludeUnsupportedProxy(platform: Platform, ua: string): boolean {
  try {
    const target = getPlatformFromUserAgent({
      UA: ua,
      ua: ua.toLowerCase(),
      accept: ''
    });

    if (!['Stash', 'Egern'].includes(target)) {
      return false;
    }

    const version = coerce(ua)?.version;
    if (!version) return false;

    if (
      platform === 'Stash' &&
      target === 'Stash' &&
      gte(version, '2.8.0')
    ) {
      return true;
    }

    if (
      platform === 'Egern' &&
      target === 'Egern' &&
      gte(version, '1.29.0')
    ) {
      return true;
    }
  } catch (e) {
    $.error(`获取版本号失败: ${e instanceof Error ? e.message : e}`);
  }
  return false;
}
