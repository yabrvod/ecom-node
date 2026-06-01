import 'dotenv/config';
import Fastify from 'fastify';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import view from '@fastify/view';
import ejs from 'ejs';
import staticPlugin from '@fastify/static';
import cookie from '@fastify/cookie';
import session from '@fastify/session';
import formbody from '@fastify/formbody';
import csrf from '@fastify/csrf-protection';

// Fallar explícitamente si SESSION_SECRET no está definido en producción
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET no está definido en producción');
    process.exit(1);
}

import authPlugin from './plugins/auth.js';
import catalogRoutes from './catalog/routes/catalogRoutes.js';
import cartRoutes from './cart/routes/cartRoutes.js';
import adminRoutes from './admin/routes/adminRoutes.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const isProd = process.env.NODE_ENV === 'production';

const fastify = Fastify({
    logger: isProd ? { level: 'info' } : { level: 'debug', transport: { target: 'pino-pretty' } },
    trustProxy: true,
    bodyLimit: 1024 * 1024,
});


await fastify.register(formbody);
await fastify.register(cookie);
await fastify.register(session, {
    secret: process.env.SESSION_SECRET || 'dev-secret-must-be-at-least-32-chars-long-here!!',
    cookie: { secure: isProd, httpOnly: true, sameSite: 'lax', maxAge: 3600 * 1000 },
    saveUninitialized: true,
});
await fastify.register(csrf, { sessionPlugin: '@fastify/session' });

await fastify.register(view, {
    engine: { ejs },
    root: join(__dirname, 'views'),
    propertyName: 'view',
    includeViewExtension: false,
    defaultContext: {},
    options: { async: false },
});

await fastify.register(staticPlugin, {
    root: join(__dirname, '..', 'public'),
    prefix: '/static/',
});

await fastify.register(authPlugin);
await fastify.register(catalogRoutes);
await fastify.register(cartRoutes);
await fastify.register(adminRoutes);

fastify.get('/health', async () => ({ status: 'UP' }));

fastify.get('/robots.txt', (req, reply) => {
    reply.type('text/plain').send('User-agent: *\nDisallow: /login\nDisallow: /admin\nDisallow: /carrito\n');
});

fastify.setNotFoundHandler(async (req, reply) => {
    return reply.code(404).view('error/404.ejs', {});
});

fastify.setErrorHandler(async (err, req, reply) => {
    req.log.error(err);
    const msg = isProd ? 'Error interno del servidor' : err.message;
    return reply.code(500).view('error/500.ejs', { error: msg });
});

const port = parseInt(process.env.PORT || '3001', 10);
try {
    await fastify.listen({ port, host: '0.0.0.0' });
} catch (err) {
    fastify.log.error(err);
    process.exit(1);
}
