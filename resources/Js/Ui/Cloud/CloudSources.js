const CloudSources = (() => {
  const USER_AGENT =
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
  const LISTING_CACHE_TTL = 5 * 60 * 1000;
  const RAW_SCRIPT_CACHE_TTL = 30 * 60 * 1000;
  const CURL_TIMEOUT_SECS = 10;
  const CURL_RETRY_ATTEMPTS = 3;
  const CURL_RETRY_BASE_DELAY_MS = 900;
  const _cache = new Map();
  function _cacheGet(key) {
    const entry = _cache.get(key);
    if (!entry) return null;
    if (Date.now() - entry.ts > entry.ttl) {
      _cache.delete(key);
      return null;
    }
    return entry.data;
  }
  function _cacheSet(key, data, ttl = LISTING_CACHE_TTL) {
    _cache.set(key, {
      data,
      ts: Date.now(),
      ttl,
    });
  }
  function _sbUrl(endpoint, query, page, filters = {}) {
    const params = new URLSearchParams({
      page,
    });
    if (query) params.set('q', query);
    if (filters.verified) params.set('verified', '1');
    if (filters.universal) params.set('universal', '1');
    if (filters.noKey) params.set('key', '0');
    if (filters.notPatched) params.set('patched', '0');
    if (filters.sortBy) params.set('sortBy', filters.sortBy);
    return `https://scriptblox.com/api/script/${endpoint}?${params}`;
  }
  function _rsUrl(query, page, filters = {}) {
    const params = new URLSearchParams({
      page,
      orderBy: filters.orderBy ?? 'date',
      sort: 'desc',
    });
    if (query) params.set('q', query);
    if (filters.verified) params.set('verified', 'true');
    if (filters.universal) params.set('isUniversal', 'true');
    if (filters.noKey) params.set('keySystem', 'false');
    if (filters.mobileReady) params.set('mobileReady', 'true');
    return `https://rscripts.net/api/v2/scripts?${params}`;
  }
  function _sbImg(script) {
    const raw = script.image;
    if (!raw) return null;
    return raw.startsWith('http') ? raw : `https://scriptblox.com/${raw.replace(/^\//, '')}`;
  }
  function _sbNorm(response) {
    return {
      totalPages: response.result?.totalPages ?? 1,
      scripts: (response.result?.scripts ?? []).map((s) => ({
        _src: 'scriptblox',
        _slug: s.slug ?? '',
        _rawUrl: null,
        title: s.title ?? '',
        gameName: s.game?.name ?? null,
        gameImg: _sbImg(s),
        views: s.views ?? 0,
        createdAt: s.createdAt ?? null,
        verified: !!s.verified,
        isUniversal: !!s.isUniversal,
        isPatched: !!s.isPatched,
        hasKey: !!s.key,
        scriptType: s.scriptType ?? null,
        content: s.script ?? null,
      })),
    };
  }
  function _rsNorm(response) {
    return {
      totalPages: response.totalPages ?? response.pages ?? 1,
      scripts: (response.scripts ?? response.data ?? []).map((s) => ({
        _src: 'rscripts',
        _slug: s._id ?? s.id ?? '',
        _rawUrl: s.rawScript ?? null,
        title: s.title ?? '',
        gameName: s.game?.name ?? null,
        gameImg: s.image ?? null,
        views: s.views ?? 0,
        createdAt: s.createdAt ?? s.lastUpdated ?? null,
        verified: !!s.verified,
        isUniversal: !!s.isUniversal,
        isPatched: !!s.isPatched,
        hasKey: !!s.keySystem,
        scriptType: null,
        content: null,
      })),
    };
  }
  async function _curl(url) {
    const cached = _cacheGet(url);
    if (cached !== null) return cached;
    for (let attempt = 0; attempt < CURL_RETRY_ATTEMPTS; attempt++) {
      try {
        const text = await window.__TAURI__.core.invoke('http_fetch', {
          url,
          headers: {
            Accept: 'application/json',
            'User-Agent': USER_AGENT,
          },
        });
        const data = JSON.parse(text);
        _cacheSet(url, data);
        return data;
      } catch (e) {
        if (attempt === CURL_RETRY_ATTEMPTS - 1) throw e;
        await new Promise((resolve) =>
          setTimeout(resolve, CURL_RETRY_BASE_DELAY_MS * (attempt + 1)),
        );
      }
    }
    throw new Error('Request failed after retries');
  }
  async function _curlText(url) {
    const cached = _cacheGet(url);
    if (cached !== null) return cached;
    const text = await window.__TAURI__.core.invoke('http_fetch', {
      url,
      headers: {
        'User-Agent': USER_AGENT,
      },
    });
    _cacheSet(url, text, RAW_SCRIPT_CACHE_TTL);
    return text;
  }
  function sanitize(scripts) {
    return scripts.filter((s) => s.title?.trim() && (s._slug || s._rawUrl || s.content));
  }
  const SOURCES = {
    scriptblox: {
      label: 'ScriptBlox',
      tag: 'SB',
      async fetchRecent(page, filters) {
        return _sbNorm(await _curl(_sbUrl('fetch', null, page, filters)));
      },
      async fetchTrending(page, filters) {
        return _sbNorm(await _curl(_sbUrl('trending', null, page, filters)));
      },
      async fetchSearch(query, page, filters) {
        return _sbNorm(await _curl(_sbUrl('search', query, page, filters)));
      },
      async fetchRaw(slug) {
        const url = `https://scriptblox.com/api/script/raw/${slug}`;
        const cached = _cacheGet(url);
        if (cached !== null) return cached;
        const data = await _curl(url);
        const result = data.script ?? '';
        _cacheSet(url, result, RAW_SCRIPT_CACHE_TTL);
        return result;
      },
    },
    rscripts: {
      label: 'rScripts',
      tag: 'RS',
      async fetchRecent(page, filters) {
        return _rsNorm(await _curl(_rsUrl(null, page, filters)));
      },
      async fetchTrending(page, filters) {
        return _rsNorm(
          await _curl(
            _rsUrl(null, page, {
              ...filters,
              orderBy: 'views',
            }),
          ),
        );
      },
      async fetchSearch(query, page, filters) {
        return _rsNorm(await _curl(_rsUrl(query, page, filters)));
      },
      async fetchRaw(id, rawUrl) {
        const cacheKey = rawUrl ?? `rscripts:raw:${id}`;
        const cached = _cacheGet(cacheKey);
        if (cached !== null) return cached;
        let result;
        if (rawUrl) {
          result = await _curlText(rawUrl);
        } else {
          const data = await _curl(
            `https://rscripts.net/api/v2/script?id=${encodeURIComponent(id)}`,
          );
          const scriptUrl = data.script?.rawScript ?? data.rawScript;
          if (!scriptUrl) throw new Error('no rawScript URL');
          result = await _curlText(scriptUrl);
        }
        _cacheSet(cacheKey, result, RAW_SCRIPT_CACHE_TTL);
        return result;
      },
    },
  };
  return {
    SOURCES,
    sanitize,
  };
})();
