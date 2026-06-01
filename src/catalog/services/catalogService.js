import { db } from '../../db/connection.js';
import { sql } from 'kysely';

// Cache simple en memoria — equivalente al Caffeine del Spring
const cache = new Map();
const TTL = 60_000;

function cached(key, fn) {
    const entry = cache.get(key);
    if (entry && Date.now() - entry.ts < TTL) return entry.data;
    const data = fn();
    cache.set(key, { data, ts: Date.now() });
    return data;
}

export async function listProducts({ category, search, maxPrice, page = 0, limit = 12 } = {}) {
    let q = db
        .selectFrom('products as p')
        .innerJoin('categories as c', 'c.id', 'p.category_id')
        .leftJoin('product_variants as v', 'v.product_id', 'p.id')
        .leftJoin('inventory as i', 'i.variant_id', 'v.id')
        .select([
            'p.id',
            'p.name',
            'p.slug',
            'p.base_price as basePrice',
            'c.name as categoryName',
            db.fn.min('i.stock').as('minStock'),
        ])
        .where('p.active', '=', true)
        .groupBy(['p.id', 'p.name', 'p.slug', 'p.base_price', 'c.name', 'p.created_at'])
        .orderBy('p.created_at', 'desc')
        .limit(limit)
        .offset(page * limit);

    if (category) q = q.where('c.slug', '=', category);
    if (search)   q = q.where(eb => eb.or([
        eb(sql`lower(p.name)`, 'like', `%${search.toLowerCase()}%`),
        eb(sql`lower(p.description)`, 'like', `%${search.toLowerCase()}%`),
    ]));
    if (maxPrice) q = q.where('p.base_price', '<=', maxPrice);

    return q.execute();
}

export async function countProducts({ category, search, maxPrice } = {}) {
    let q = db.selectFrom('products as p')
        .innerJoin('categories as c', 'c.id', 'p.category_id')
        .select(db.fn.countAll().as('total'))
        .where('p.active', '=', true);

    if (category) q = q.where('c.slug', '=', category);
    if (search)   q = q.where(eb => eb.or([
        eb(sql`lower(p.name)`, 'like', `%${search.toLowerCase()}%`),
        eb(sql`lower(p.description)`, 'like', `%${search.toLowerCase()}%`),
    ]));
    if (maxPrice) q = q.where('p.base_price', '<=', maxPrice);

    const r = await q.executeTakeFirst();
    return Number(r.total);
}

export async function findProductBySlug(slug) {
    const product = await db
        .selectFrom('products as p')
        .innerJoin('categories as c', 'c.id', 'p.category_id')
        .select([
            'p.id', 'p.name', 'p.slug', 'p.description',
            'p.base_price as basePrice',
            'c.name as categoryName', 'c.slug as categorySlug',
        ])
        .where('p.slug', '=', slug)
        .where('p.active', '=', true)
        .executeTakeFirst();

    if (!product) return null;

    const variants = await db
        .selectFrom('product_variants as v')
        .leftJoin('inventory as i', 'i.variant_id', 'v.id')
        .select([
            'v.id', 'v.sku', 'v.name', 'v.price',
            sql`coalesce(i.stock, 0)`.as('stock'),
        ])
        .where('v.product_id', '=', product.id)
        .where('v.active', '=', true)
        .orderBy('v.price')
        .execute();

    return { ...product, variants };
}

export async function listCategories() {
    return cached('categories', () =>
        db.selectFrom('categories')
          .select(['id', 'name', 'slug'])
          .orderBy('name')
          .execute()
    );
}
