// 腾讯云 SCF HTTP 函数适配层
// 将 SCF 的 HTTP 事件转换为 Node.js HTTP 请求，交由 Next.js 处理

const http = require('http');
const { spawn } = require('child_process');
const path = require('path');

// 单例模式：只启动一次 Next.js 服务
let serverPromise = null;
let serverPort = null;

/**
 * 启动 Next.js 服务器（在子进程中运行）
 */
function startNextServer() {
  if (serverPromise) return serverPromise;

  serverPromise = new Promise((resolve, reject) => {
    // 使用随机端口
    const port = 9000 + Math.floor(Math.random() * 1000);
    serverPort = port;

    const serverProcess = spawn('node', ['server.js'], {
      cwd: __dirname,
      env: {
        ...process.env,
        PORT: port,
        HOSTNAME: '127.0.0.1',
        NODE_ENV: 'production',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    serverProcess.stdout.on('data', (data) => {
      console.log('[Next.js]', data.toString());
    });

    serverProcess.stderr.on('data', (data) => {
      console.error('[Next.js Error]', data.toString());
    });

    serverProcess.on('error', (err) => {
      console.error('Failed to start Next.js server:', err);
      reject(err);
    });

    serverProcess.on('exit', (code) => {
      console.error(`Next.js server exited with code ${code}`);
      serverPromise = null;
    });

    // 等待服务器启动（最多等待 30 秒）
    const startTime = Date.now();
    const checkServer = () => {
      const req = http.request(
        {
          hostname: '127.0.0.1',
          port,
          path: '/',
          method: 'HEAD',
          timeout: 1000,
        },
        () => {
          console.log(`Next.js server started on port ${port}`);
          resolve(serverProcess);
        }
      );

      req.on('error', () => {
        if (Date.now() - startTime < 30000) {
          setTimeout(checkServer, 500);
        } else {
          reject(new Error('Next.js server failed to start within 30 seconds'));
        }
      });

      req.end();
    };

    setTimeout(checkServer, 1000);
  });

  return serverPromise;
}

/**
 * 将 SCF HTTP 事件转发到 Next.js 服务器
 */
function proxyRequest(event) {
  return new Promise((resolve, reject) => {
    const path = event.path || '/';
    const queryString = event.queryString || {};
    const queryParams = new URLSearchParams(queryString).toString();
    const fullPath = queryParams ? `${path}?${queryParams}` : path;

    // 从事件头中获取真实的 Host（SCF 会透传请求头）
    const headers = { ...(event.headers || {}) };
    // 确保 Host 头是公网域名（优先使用 X-Forwarded-Host）
    const realHost = headers['x-forwarded-host'] || headers['host'] || headers['Host'];
    if (realHost) {
      headers['host'] = realHost;
      // 同时设置 X-Forwarded-Proto 为 https（SCF HTTP 函数默认走 HTTPS）
      headers['x-forwarded-proto'] = headers['x-forwarded-proto'] || 'https';
    }

    const options = {
      hostname: '127.0.0.1',
      port: serverPort,
      path: fullPath,
      method: event.httpMethod || 'GET',
      headers: headers,
    };

    const req = http.request(options, (res) => {
      let body = '';
      res.on('data', (chunk) => {
        body += chunk;
      });
      res.on('end', () => {
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
          isBase64Encoded: false,
        });
      });
    });

    req.on('error', reject);

    // 发送请求体
    if (event.body) {
      if (event.isBase64Encoded) {
        req.write(Buffer.from(event.body, 'base64'));
      } else {
        req.write(event.body);
      }
    }

    req.end();
  });
}

/**
 * SCF HTTP 函数主入口
 */
exports.main_handler = async (event, context) => {
  try {
    // 确保 Next.js 服务器已启动
    await startNextServer();

    // 转发请求
    const response = await proxyRequest(event);

    return response;
  } catch (error) {
    console.error('Handler error:', error);
    return {
      statusCode: 500,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        error: 'Internal Server Error',
        message: error.message,
      }),
      isBase64Encoded: false,
    };
  }
};
