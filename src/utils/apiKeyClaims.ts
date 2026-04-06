type JwtPayload = Record<string, unknown> & {
  tenantId?: unknown;
};

function decodeBase64Url(input: string): string {
  const normalized = input.replace(/-/g, '+').replace(/_/g, '/');
  const padding = (4 - (normalized.length % 4)) % 4;
  return Buffer.from(normalized + '='.repeat(padding), 'base64').toString(
    'utf8',
  );
}

function decodeJwtPayload(token: string): JwtPayload | undefined {
  if (!token || typeof token !== 'string') {
    return undefined;
  }
  const parts = token.split('.');
  if (parts.length < 2) {
    return undefined;
  }
  try {
    const decoded = decodeBase64Url(parts[1] || '');
    const parsed = JSON.parse(decoded);
    if (!parsed || typeof parsed !== 'object') {
      return undefined;
    }
    return parsed as JwtPayload;
  } catch {
    return undefined;
  }
}

export function getTenantIdFromApiKey(apiKey: string): string | undefined {
  const payload = decodeJwtPayload((apiKey || '').trim());
  if (!payload) {
    return undefined;
  }
  const tenantId = payload.tenantId;
  if (typeof tenantId !== 'string') {
    return undefined;
  }
  const normalized = tenantId.trim();
  return normalized || undefined;
}
