/** 파일 내용의 SHA-256 (hex). 같은 PDF를 이름만 바꿔 올려도 같은 문서로 본다 */
export async function sha256(buf: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
