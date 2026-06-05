const https = require('https');

exports.handler = async (event) => {
    const targetUrl = event.queryStringParameters.url;

    if (!targetUrl) {
        return {
            statusCode: 400,
            body: JSON.stringify({ error: 'Missing url parameter' })
        };
    }

    return new Promise((resolve) => {
        https.get(targetUrl, (res) => {
            let data = '';

            res.on('data', (chunk) => {
                data += chunk;
            });

            res.on('end', () => {
                resolve({
                    statusCode: 200,
                    headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                        'Cache-Control': 'public, max-age=60'
                    },
                    body: data
                });
            });
        }).on('error', (error) => {
            resolve({
                statusCode: 500,
                headers: {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                body: JSON.stringify({ error: error.message })
            });
        });
    });
};