/**
 * Simple local development server for testing the API
 * 
 * This avoids needing Vercel CLI authentication for local testing.
 * Usage: node dev-server.js
 */

const http = require('http');

// Load environment variables from .env file if it exists
try {
  require('dotenv').config();
} catch (e) {
  // dotenv not installed, that's fine - use process.env directly
}

const PORT = process.env.PORT || 3000;

const server = http.createServer(async (req, res) => {
  // Enable CORS for local development
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-SendSafe-Secret');

  // Handle preflight requests
  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // Only handle the API endpoint
  if (req.url === '/api/check-ai-traces' && req.method === 'POST') {
    let body = '';
    
    req.on('data', chunk => {
      body += chunk.toString();
    });

    req.on('end', async () => {
      try {
        // Dynamically import the TypeScript handler using ts-node
        // We need to register ts-node first
        require('ts-node').register({
          transpileOnly: true,
          compilerOptions: {
            module: 'commonjs'
          }
        });

        // Import the handler
        const { default: handler } = require('./api/check-ai-traces');

        // Create mock request/response objects
        const mockReq = {
          method: req.method,
          headers: req.headers,
          body: body ? JSON.parse(body) : {},
          url: req.url,
        };

        const mockRes = {
          statusCode: 200,
          _headers: {},
          setHeader(name, value) {
            this._headers[name.toLowerCase()] = value;
            return this;
          },
          status(code) {
            this.statusCode = code;
            return this;
          },
          json(data) {
            res.writeHead(this.statusCode, {
              'Content-Type': 'application/json',
              ...this._headers
            });
            res.end(JSON.stringify(data));
          },
          send(data) {
            res.writeHead(this.statusCode, this._headers);
            res.end(typeof data === 'string' ? data : JSON.stringify(data));
          }
        };

        // Call the handler
        await handler(mockReq, mockRes);
      } catch (error) {
        console.error('Error:', error);
        res.writeHead(500, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: error.message }));
      }
    });
  } else {
    res.writeHead(404, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => {
  console.log(`\n🚀 SendSafe backend running at http://localhost:${PORT}`);
  console.log(`📡 API endpoint: http://localhost:${PORT}/api/check-ai-traces\n`);
  console.log('Required environment variables:');
  console.log(`  OPENAI_API_KEY: ${process.env.OPENAI_API_KEY ? '✅ Set' : '❌ Missing'}`);
  console.log(`  SENDSAFE_SHARED_SECRET: ${process.env.SENDSAFE_SHARED_SECRET ? '✅ Set' : '❌ Missing'}`);
  console.log('\nPress Ctrl+C to stop the server.\n');
});






