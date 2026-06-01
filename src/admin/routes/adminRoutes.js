import { db } from '../../db/connection.js';
import { sql } from 'kysely';

export default async function adminRoutes(fastify) {

    // Middleware auth admin
    fastify.addHook('preHandler', async (req, reply) => {
        if (!req.session.user?.isAdmin)
            return reply.redirect('/login?next=/admin');
    });

    fastify.get('/admin', async (req, reply) => {
        const [totalProducts, ordersToday, totalRevenue, totalUsers, recentOrders, lowStock] = await Promise.all([
            db.selectFrom('products').select(db.fn.countAll().as('n')).where('active', '=', true).executeTakeFirst().then(r => Number(r.n)),
            db.selectFrom('orders').select(db.fn.countAll().as('n')).where('created_at', '>=', sql`now() - interval '1 day'`).executeTakeFirst().then(r => Number(r.n)),
            db.selectFrom('orders').select(db.fn.sum('total').as('s')).where('status', '=', 'CONFIRMED').executeTakeFirst().then(r => Number(r.s) || 0),
            db.selectFrom('users').select(db.fn.countAll().as('n')).executeTakeFirst().then(r => Number(r.n)),
            db.selectFrom('orders as o').leftJoin('users as u', 'u.id', 'o.user_id')
                .select(['o.id', 'u.username', 'o.total', 'o.status', 'o.created_at'])
                .orderBy('o.created_at', 'desc').limit(10).execute(),
            db.selectFrom('inventory as i')
                .innerJoin('product_variants as v', 'v.id', 'i.variant_id')
                .innerJoin('products as p', 'p.id', 'v.product_id')
                .select(['p.name as productName', 'v.name as variantName', 'v.sku', 'i.stock'])
                .where('i.stock', '<=', 5).orderBy('i.stock').execute(),
        ]);

        return reply.view('admin/index.ejs', {
            stats: { totalProducts, ordersToday, totalRevenue, totalUsers },
            recentOrders, lowStock, user: req.user,
        });
    });
}
