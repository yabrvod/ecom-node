import { db } from '../../db/connection.js';
import { sql } from 'kysely';

export async function getOrCreateCart(sessionId) {
    let cart = await db.selectFrom('carts')
        .selectAll()
        .where('session_id', '=', sessionId)
        .executeTakeFirst();

    if (!cart) {
        const result = await db.insertInto('carts')
            .values({ session_id: sessionId })
            .returning(['id', 'session_id', 'user_id'])
            .executeTakeFirst();
        cart = result;
    }
    return cart;
}

export async function getCartItems(cartId) {
    return db.selectFrom('cart_items as ci')
        .innerJoin('product_variants as v', 'v.id', 'ci.variant_id')
        .innerJoin('products as p', 'p.id', 'v.product_id')
        .leftJoin('inventory as i', 'i.variant_id', 'v.id')
        .select([
            'ci.variant_id as variantId',
            'ci.quantity',
            'p.name as productName',
            'v.name as variantName',
            'v.price',
            sql`coalesce(i.stock, 0)`.as('stock'),
        ])
        .where('ci.cart_id', '=', cartId)
        .execute();
}

export async function addItem(cartId, variantId, quantity) {
    await db.insertInto('cart_items')
        .values({ cart_id: cartId, variant_id: variantId, quantity })
        .onConflict(oc => oc.columns(['cart_id', 'variant_id'])
            .doUpdateSet({ quantity: sql`cart_items.quantity + ${quantity}` }))
        .execute();
}

export async function updateQuantity(cartId, variantId, quantity) {
    if (quantity <= 0) {
        await removeItem(cartId, variantId);
        return;
    }
    await db.updateTable('cart_items')
        .set({ quantity })
        .where('cart_id', '=', cartId)
        .where('variant_id', '=', variantId)
        .execute();
}

export async function removeItem(cartId, variantId) {
    await db.deleteFrom('cart_items')
        .where('cart_id', '=', cartId)
        .where('variant_id', '=', variantId)
        .execute();
}

export async function clearCart(cartId) {
    await db.deleteFrom('carts').where('id', '=', cartId).execute();
}

export function calcTotal(items) {
    return items.reduce((sum, i) => sum + Number(i.price) * i.quantity, 0);
}
