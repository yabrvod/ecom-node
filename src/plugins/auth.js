import { db } from '../db/connection.js';
import bcrypt from 'bcryptjs';
import fp from 'fastify-plugin';

export default fp(async function authPlugin(fastify) {

    fastify.decorateRequest('user', null);

    fastify.addHook('preHandler', async (req) => {
        if (req.session.user) req.user = req.session.user;
    });

    fastify.post('/login', async (req, reply) => {
        const { username, password } = req.body;
        const user = await db.selectFrom('users')
            .selectAll()
            .where('username', '=', username)
            .where('enabled', '=', true)
            .executeTakeFirst();

        if (!user || !bcrypt.compareSync(password, user.password))
            return reply.redirect('/login?error=1');

        const roles = await db.selectFrom('user_roles')
            .select('role')
            .where('user_id', '=', user.id)
            .execute();

        req.session.user = {
            id: user.id,
            username: user.username,
            isAdmin: roles.some(r => r.role === 'ROLE_ADMIN'),
        };
        return reply.redirect(req.query.next || '/');
    });

    fastify.post('/logout', async (req, reply) => {
        req.session.destroy();
        return reply.redirect('/');
    });

    fastify.get('/login', async (req, reply) => {
        const csrf = reply.generateCsrf();
        return reply.view('auth/login.ejs', { error: req.query.error, csrf });
    });

    fastify.get('/register', async (req, reply) => {
        const csrf = reply.generateCsrf();
        return reply.view('auth/register.ejs', { error: req.query.error, csrf });
    });

    fastify.post('/register', async (req, reply) => {
        const { username, email, password } = req.body;
        if (!username || !email || !password || password.length < 6)
            return reply.redirect('/register?error=1');

        const exists = await db.selectFrom('users')
            .select('id')
            .where(eb => eb.or([eb('username', '=', username), eb('email', '=', email)]))
            .executeTakeFirst();

        if (exists) return reply.redirect('/register?error=exists');

        const hash = bcrypt.hashSync(password, 10);
        const user = await db.insertInto('users')
            .values({ username, email, password: hash })
            .returning(['id', 'username'])
            .executeTakeFirst();

        await db.insertInto('user_roles')
            .values({ user_id: user.id, role: 'ROLE_USER' })
            .execute();

        req.session.user = { id: user.id, username: user.username, isAdmin: false };
        return reply.redirect('/');
    });
});
