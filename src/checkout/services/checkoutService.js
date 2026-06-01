import { db } from '../../db/connection.js';
import { sql } from 'kysely';
import { getCartItems, clearCart } from '../../cart/services/cartService.js';
import { randomUUID } from 'crypto';

export async function checkout(cartId, { shippingName, shippingAddress, userId = null }) {
    const items = await getCartItems(cartId);
    if (!items.length) throw new Error('El carrito está vacío');

    // Fase 1: validar stock antes de la transacción
    for (const item of items) {
        if (item.stock < item.quantity)
            throw new Error(`Stock insuficiente para ${item.productName} - ${item.variantName} (disponible: ${item.stock})`);
    }

    // Fase 2: transacción — descontar stock + crear orden
    return db.transaction().execute(async trx => {
        const total = items.reduce((s, i) => s + Number(i.price) * i.quantity, 0);

        // Crear orden
        const order = await trx.insertInto('orders')
            .values({
                user_id: userId,
                status: 'CONFIRMED',
                total: total.toFixed(2),
                shipping_name: shippingName,
                shipping_address: shippingAddress,
                confirmation_token: randomUUID(),
            })
            .returning(['id', 'confirmation_token'])
            .executeTakeFirst();

        // Crear order_items + descontar inventario
        for (const item of items) {
            await trx.insertInto('order_items')
                .values({
                    order_id: order.id,
                    variant_id: item.variantId,
                    product_name: item.productName,
                    variant_name: item.variantName,
                    unit_price: item.price,
                    quantity: item.quantity,
                })
                .execute();

            const updated = await trx.updateTable('inventory')
                .set({ stock: sql`stock - ${item.quantity}`, updated_at: sql`now()` })
                .where('variant_id', '=', item.variantId)
                .where('stock', '>=', item.quantity)
                .executeTakeFirst();

            if (!updated || updated.numUpdatedRows === 0n)
                throw new Error(`Stock agotado para ${item.productName}`);
        }

        // Payment simulado
        await trx.insertInto('payments')
            .values({
                order_id: order.id,
                status: 'APPROVED',
                method: 'SIMULATED',
                amount: total.toFixed(2),
                processed_at: sql`now()`,
            })
            .execute();

        // Vaciar carrito
        await clearCart(cartId);

        return order;
    });
}

export async function getOrderByToken(token) {
    const order = await db.selectFrom('orders')
        .selectAll()
        .where('confirmation_token', '=', token)
        .executeTakeFirst();

    if (!order) return null;

    const items = await db.selectFrom('order_items')
        .selectAll()
        .where('order_id', '=', order.id)
        .execute();

    const payment = await db.selectFrom('payments')
        .selectAll()
        .where('order_id', '=', order.id)
        .executeTakeFirst();

    return { ...order, items, payment };
}
