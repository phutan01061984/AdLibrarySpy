import { NextRequest, NextResponse } from 'next/server';

/**
 * Image proxy API to bypass CORS restrictions on Facebook CDN images.
 * Usage: /api/proxy-image?url=https://scontent.xx.fbcdn.net/...
 */
export async function GET(request: NextRequest) {
  const url = request.nextUrl.searchParams.get('url');
  
  if (!url) {
    return NextResponse.json({ error: 'Missing url parameter' }, { status: 400 });
  }

  try {
    // Validate URL is from allowed domains
    const parsedUrl = new URL(url);
    const allowedHosts = [
      'scontent', 'external', 'fbcdn', 'facebook', 'fbsbx',
      'lookaside', 'platform-lookaside', 'z-m-scontent',
    ];
    
    const isAllowed = allowedHosts.some(host => 
      parsedUrl.hostname.includes(host)
    );

    if (!isAllowed) {
      return NextResponse.json(
        { error: 'URL domain not allowed' },
        { status: 403 }
      );
    }

    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        'Accept': 'image/*,*/*',
        'Referer': 'https://www.facebook.com/',
      },
    });

    if (!response.ok) {
      return NextResponse.json(
        { error: `Failed to fetch image: ${response.status}` },
        { status: response.status }
      );
    }

    const contentType = response.headers.get('content-type') || 'image/jpeg';
    const buffer = await response.arrayBuffer();

    return new NextResponse(buffer, {
      headers: {
        'Content-Type': contentType,
        'Cache-Control': 'public, max-age=86400, s-maxage=86400',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (e: any) {
    return NextResponse.json(
      { error: `Proxy error: ${e.message}` },
      { status: 500 }
    );
  }
}
