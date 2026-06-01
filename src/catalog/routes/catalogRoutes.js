import { listProducts, countProducts, findProductBySlug, listCategories } from '../services/catalogService.js';

export default async function catalogRoutes(fastify) {
    fastify.get('/', async (req, reply) => {
        const { q, category, maxPrice, page = 0 } = req.query;
        const [products, total, categories] = await Promise.all([
            listProducts({ category, search: q, maxPrice: maxPrice ? Number(maxPrice) : null, page: Number(page) }),
            countProducts({ category, search: q, maxPrice: maxPrice ? Number(maxPrice) : null }),
            listCategories(),
        ]);
        return reply.view('catalog/index.ejs', {
            products, total, categories,
            q, category, maxPrice, page: Number(page),
            totalPages: Math.ceil(total / 12),
            user: req.user,
        });
    });

    fastify.get('/productos/:slug', async (req, reply) => {
        const product = await findProductBySlug(req.params.slug);
        if (!product) return reply.code(404).view('error/404.ejs', {});
        const [categories, csrf] = [await listCategories(), reply.generateCsrf()];
        return reply.view('catalog/detail.ejs', { product, categories, csrf, user: req.user });
    });

    // HTMX — búsqueda en vivo
    fastify.get('/htmx/productos/search', async (req, reply) => {
        const { q, category, maxPrice } = req.query;
        const products = await listProducts({ category, search: q, maxPrice: maxPrice ? Number(maxPrice) : null });
        return reply.view('catalog/partials/product-grid.ejs', { products });
    });
}
