const http = require('http');
const https = require('https');
const { URL } = require('url');

const PORT = 3001;

http.createServer((req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') {
        res.writeHead(204);
        res.end();
        return;
    }

    const target = new URL('http://localhost' + req.url).searchParams.get('url');

    let parsed;
    try {
        parsed = new URL(target);
    } catch {
        res.writeHead(400);
        res.end('Bad request');
        return;
    }

    const options = {
        hostname: parsed.hostname,
        path: parsed.pathname + parsed.search,
        headers: { 'Accept': 'application/json', 'User-Agent': 'Mozilla/5.0' }
    };

    https.get(options, (upstream) => {
        res.writeHead(upstream.statusCode, {
            'Content-Type': upstream.headers['content-type'] || 'application/json',
            'Access-Control-Allow-Origin': '*'
        });
        upstream.pipe(res);
    }).on('error', (err) => {
        res.writeHead(502);
        res.end(err.message);
    });
}).listen(PORT, () => console.log(`CORS proxy running at http://localhost:${PORT}`));
