import rs from 'jsrsasign';

// 补充类型声明（如果缺少）
declare module 'jsrsasign' {
  namespace KJUR.crypto.Util {
    function hashHex(dataHex: string, alg: string): string;
  }

  function pemtohex(pem: string): string;
}

export function generateFingerprint(caStr: string): string {
  const hex = rs.pemtohex(caStr);
  const fingerPrint = rs.KJUR.crypto.Util.hashHex(hex, 'sha256');
  
  // 处理可能的 null 值
  const parts = fingerPrint.match(/.{2}/g) || [];
  return parts.join(':').toUpperCase();
}

export default {
  generateFingerprint,
};
