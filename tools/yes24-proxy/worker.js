/**
 * 문장 아카이브 예스24 Open API 프록시 — Cloudflare Worker
 *
 * 왜 필요한가:
 * 예스24 Open API는 발급받은 API Key를 `X-Api-Key` 요청 헤더에 담아 인증한다.
 * 알라딘과 달리 헤더 인증이라, 편집기(브라우저)에서 <script> 태그(JSONP)로도,
 * 일반 fetch로도 직접 부를 수 없다(커스텀 헤더를 실으려면 서버가 필요하다).
 * 예스24 공식 문서도 "API Key는 클라이언트 사이드 코드에 직접 포함하지
 * 마세요"라고 명시한다.
 *
 * 그래서 이 Worker는:
 *  - API Key를 Worker의 환경변수(secret)로만 보관한다 (문장 아카이브 페이지나
 *    localStorage에는 전혀 노출되지 않음).
 *  - 문장 아카이브는 이 Worker의 URL만 알면 되고, 커스텀 헤더 없이 평범한 GET으로
 *    호출한다. Worker가 X-Api-Key를 붙여 예스24 서버로 대신 요청한다.
 *  - 허용된 경로(goods/itemList, goods/itemDetail)로만 전달해 오픈 프록시로
 *    악용되는 것을 막는다.
 *
 * ────────────────────────────────────────────────────────
 * 배포 방법 (10분, 무료):
 *
 * 1. https://dash.cloudflare.com → Workers & Pages → Create → Create Worker
 * 2. 이름 입력 (예: yes24-proxy) → Deploy
 * 3. "Edit code" → 기존 코드 전체 삭제 → 이 파일 내용 붙여넣기 → Deploy
 * 4. Settings → Variables and Secrets:
 *      YES24_API_KEY   = 예스24 개발자센터(developers.yes24.com)에서 발급받은
 *                        API Key (Secret으로 추가 — 절대 평문 Variable로 넣지
 *                        말 것. Encrypt 체크박스를 켜서 저장)
 *      ALLOWED_ORIGIN  = https://hwiruruk.github.io,http://localhost:8000
 *                        (콤마 구분. 문장 아카이브를 띄우는 모든 출처를 적을 것.
 *                        GitHub Pages는 저장소 경로와 무관하게 출처가
 *                        https://hwiruruk.github.io 하나이므로, 같은 계정의
 *                        다른 github.io 프로젝트(Book Stack 등)와 이 Worker를
 *                        함께 쓰고 있다면 이미 등록돼 있을 수 있다.)
 * 5. 생성된 URL 복사 (예: https://yes24-proxy.your-name.workers.dev)
 *
 * 사용 방법:
 * - 문장 아카이브 "책 검색" 라벨 옆 "⚙️ 예스24 설정" 버튼 → 위 URL을 그대로 입력
 *   (끝에 슬래시나 경로를 붙이지 않음)
 * - 저장 후 검색창에서 예스24 검색 사용
 *
 * 무료 한도: Cloudflare Workers 무료 플랜은 일 10만 요청 (충분).
 * 예스24 쪽 한도는 API Key 등급별로 별도 적용됨(기본키 기준 일 20,000회,
 * 초당 10회) — 발급받은 키의 등급을 developers.yes24.com에서 확인할 것.
 * ────────────────────────────────────────────────────────
 */

const YES24_BASE = 'https://apis.yes24.com/v1';
// 오픈 프록시 악용 방지: 이 두 경로로만 전달 허용.
const ALLOWED_PATHS = new Set(['/goods/itemList', '/goods/itemDetail']);

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: corsHeaders(request, env) });
    }

    const url = new URL(request.url);
    if (!ALLOWED_PATHS.has(url.pathname)) {
      return json(
        { success: false, message: `허용되지 않은 경로입니다. 허용: ${[...ALLOWED_PATHS].join(', ')}`, data: null, errorCode: 'PROXY_PATH' },
        404, request, env
      );
    }

    if (!env.YES24_API_KEY) {
      return json(
        { success: false, message: 'Worker에 YES24_API_KEY가 설정되지 않았습니다. Cloudflare 대시보드 Settings → Variables and Secrets에서 추가하세요.', data: null, errorCode: 'PROXY_CONFIG' },
        500, request, env
      );
    }

    const upstream = new URL(YES24_BASE + url.pathname);
    upstream.search = url.search;

    let upstreamRes;
    try {
      upstreamRes = await fetch(upstream.toString(), {
        method: 'GET',
        headers: {
          'X-Api-Key': env.YES24_API_KEY,
          'Accept': 'application/json',
        },
      });
    } catch (e) {
      return json(
        { success: false, message: `예스24 서버 호출 실패: ${e.message}`, data: null, errorCode: 'PROXY_FETCH' },
        502, request, env
      );
    }

    const text = await upstreamRes.text();
    return new Response(text, {
      status: upstreamRes.status,
      headers: {
        ...corsHeaders(request, env),
        'content-type': 'application/json; charset=utf-8',
        'cache-control': 'no-store',
      },
    });
  },
};

function corsHeaders(request, env) {
  const origin = request.headers.get('Origin') || '';
  const allowList = ((env && env.ALLOWED_ORIGIN) || 'https://hwiruruk.github.io,http://localhost:8000')
    .split(',').map(s => s.trim()).filter(Boolean);
  const allow = allowList.includes(origin) ? origin : allowList[0];
  return {
    'access-control-allow-origin': allow,
    'access-control-allow-methods': 'GET, OPTIONS',
    'access-control-allow-headers': 'Content-Type',
    'vary': 'Origin',
  };
}

function json(obj, status, request, env) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      ...corsHeaders(request, env),
      'content-type': 'application/json; charset=utf-8',
    },
  });
}
