import * as cartService from '../services/cartService.js';
import * as checkoutService from '../../checkout/services/checkoutService.js';

export default async function cartRoutes(fastify) {

    fastify.get('/carrito', async (req, reply) => {
        const cart = await cartService.getOrCreateCart(req.session.sessionId);
        const items = await cartService.getCartItems(cart.id);
        const total = cartService.calcTotal(items);
        const csrf = reply.generateCsrf();
        return reply.view('cart/view.ejs', { items, total, cart, csrf, user: req.user });
    });

    fastify.post('/carrito/agregar', async (req, reply) => {
        const { variantId, quantity = 1 } = req.body;
        const cart = await cartService.getOrCreateCart(req.session.sessionId);
        await cartService.addItem(cart.id, Number(variantId), Number(quantity));
        return reply.redirect('/carrito');
    });

    fastify.post('/carrito/actualizar', async (req, reply) => {
        const { variantId, quantity } = req.body;
        const cart = await cartService.getOrCreateCart(req.session.sessionId);
        await cartService.updateQuantity(cart.id, Number(variantId), Number(quantity));
        return reply.redirect('/carrito');
    });

    fastify.post('/carrito/eliminar/:variantId', async (req, reply) => {
        const cart = await cartService.getOrCreateCart(req.session.sessionId);
        await cartService.removeItem(cart.id, Number(req.params.variantId));
        return reply.redirect('/carrito');
    });

    fastify.post('/carrito/checkout', async (req, reply) => {
        const { shippingName, shippingAddress } = req.body;
        try {
            const cart = await cartService.getOrCreateCart(req.session.sessionId);
            const order = await checkoutService.checkout(cart.id, { shippingName, shippingAddress });
            return reply.redirect(`/checkout/confirmacion/${order.confirmation_token}`);
        } catch (err) {
            req.session.error = err.message;
            return reply.redirect('/carrito');
        }
    });

    fastify.get('/checkout/confirmacion/:token', async (req, reply) => {
        const order = await checkoutService.getOrderByToken(req.params.token);
        if (!order) return reply.code(404).view('error/404.ejs', {});
        return reply.view('checkout/confirmation.ejs', { order, user: req.user });
    });
}
