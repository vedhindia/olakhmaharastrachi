const { Cart, CartItem, Product, ProductImage, ProductVariant } = require('../models');
const path = require('path');

const normalizeStoredImageUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  const normalized = imageUrl.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized);
  return `/uploads/${baseName}`;
};

const resolveVariantPriceAndStock = (product, variant, userType) => {
  let price = 0;
  let stock = Number(product?.stock ?? 0);
  let variantName = null;
  if (variant) {
    variantName = variant.variant_value || null;
    stock = Number(variant.stock ?? 0);
    if (userType === 'wholesaler') {
      price = variant.wholesaler_price ?? variant.customer_price ?? product?.wholesaler_price ?? product?.customer_price ?? 0;
    } else {
      price = variant.customer_price ?? product?.customer_price ?? 0;
    }
  } else {
    if (userType === 'wholesaler') {
      price = product?.wholesaler_price ?? product?.customer_price ?? 0;
    } else {
      price = product?.customer_price ?? 0;
    }
  }
  return { price: Number(price) || 0, stock: stock >= 0 ? stock : 0, variantName };
};

exports.addToCart = async (req, res) => {
  try {
    const { product_id, quantity, variant_id } = req.body;
    const userId = req.user.id;
    const userType = req.userType; // 'customer' or 'wholesaler'

    if (!product_id || !quantity) {
      return res.status(400).json({ message: 'Product ID and quantity are required' });
    }

    const product = await Product.findByPk(product_id);
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const normalizedVariantId =
      variant_id === undefined || variant_id === null || variant_id === ''
        ? null
        : Number.isNaN(Number(variant_id))
        ? null
        : Number(variant_id);

    let variant = null;
    if (normalizedVariantId !== null) {
      variant = await ProductVariant.findOne({
        where: { id: normalizedVariantId, product_id: product_id },
      });
      if (!variant) {
        return res.status(400).json({ message: 'Selected product variant does not exist' });
      }
      if (variant.status === 'inactive') {
        return res.status(400).json({ message: 'Selected variant is currently unavailable' });
      }
    }

    const { price, stock, variantName } = resolveVariantPriceAndStock(product, variant, userType);

    // Find or create cart
    let cartWhere = {};
    if (userType === 'wholesaler') {
      cartWhere = { wholesaler_id: userId };
    } else {
      cartWhere = { customer_id: userId };
    }

    let cart = await Cart.findOne({ where: cartWhere });
    if (!cart) {
      cart = await Cart.create(cartWhere);
    }

    // Cart item uniqueness: product_id + variant_id (different variants = different line items)
    const itemWhere = {
      cart_id: cart.id,
      product_id: product_id,
    };
    if (normalizedVariantId === null) {
      itemWhere.variant_id = null;
    } else {
      itemWhere.variant_id = normalizedVariantId;
    }
    let cartItem = await CartItem.findOne({ where: itemWhere });

    let newQuantity = parseInt(quantity);
    if (cartItem) {
        newQuantity += cartItem.quantity;
    }

    if (stock < newQuantity) {
      return res.status(400).json({ message: 'Insufficient stock. Available: ' + stock });
    }

    if (cartItem) {
      cartItem.quantity = newQuantity;
      cartItem.price = price;
      if (variantName) cartItem.variant_name = variantName;
      await cartItem.save();
    } else {
      cartItem = await CartItem.create({
        cart_id: cart.id,
        product_id: product_id,
        variant_id: normalizedVariantId,
        variant_name: variantName,
        quantity: newQuantity,
        price: price,
      });
    }

    res.status(200).json({ message: 'Item added to cart', cartItem });
  } catch (error) {
    console.error('Add to cart error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.userType;

    let cartWhere = {};
    if (userType === 'wholesaler') {
      cartWhere = { wholesaler_id: userId };
    } else {
      cartWhere = { customer_id: userId };
    }

    const cart = await Cart.findOne({
      where: cartWhere,
      include: [
        {
          model: CartItem,
          as: 'items',
          include: [
            {
              model: Product,
              as: 'product',
              include: [{ model: ProductImage, as: 'images' }],
            },
            {
              model: ProductVariant,
              as: 'variant',
            },
          ],
        },
      ],
    });

    if (!cart) {
      return res.status(200).json({ items: [], total: 0 });
    }

    let total = 0;
    const items = cart.items.map(item => {
      const itemTotal = parseFloat(item.price) * item.quantity;
      total += itemTotal;
      const json = item.toJSON();
      if (json.product && Array.isArray(json.product.images)) {
        json.product.images = json.product.images.map((img) => ({
          ...img,
          image_url: normalizeStoredImageUrl(img.image_url),
        }));
      }
      return {
        ...json,
        itemTotal: itemTotal.toFixed(2),
      };
    });

    res.status(200).json({
      id: cart.id,
      items: items,
      total: total.toFixed(2),
    });
  } catch (error) {
    console.error('Get cart error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateCartItem = async (req, res) => {
  try {
    const { quantity } = req.body;
    const { product_id, variant_id } = req.body;
    const userId = req.user.id;
    const userType = req.userType;

    if (!product_id || quantity === undefined) {
       return res.status(400).json({ message: 'Product ID and quantity are required' });
    }

    const normalizedVariantId =
      variant_id === undefined || variant_id === null || variant_id === ''
        ? null
        : Number.isNaN(Number(variant_id))
        ? null
        : Number(variant_id);

    let cartWhere = {};
    if (userType === 'wholesaler') {
      cartWhere = { wholesaler_id: userId };
    } else {
      cartWhere = { customer_id: userId };
    }

    const cart = await Cart.findOne({ where: cartWhere });
    if (!cart) {
      return res.status(404).json({ message: 'Cart not found' });
    }

    const itemWhere = {
      cart_id: cart.id,
      product_id: product_id,
    };
    if (normalizedVariantId === null) {
      itemWhere.variant_id = null;
    } else {
      itemWhere.variant_id = normalizedVariantId;
    }
    const cartItem = await CartItem.findOne({ where: itemWhere });

    if (!cartItem) {
      return res.status(404).json({ message: 'Item not found in cart' });
    }

    if (quantity <= 0) {
      await cartItem.destroy();
      return res.status(200).json({ message: 'Item removed from cart' });
    }

    cartItem.quantity = quantity;
    await cartItem.save();

    res.status(200).json({ message: 'Cart updated', cartItem });

  } catch (error) {
    console.error('Update cart error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.removeFromCart = async (req, res) => {
  try {
    const { product_id, variant_id } = req.body;
    const userId = req.user.id;
    const userType = req.userType;

    let cartWhere = {};
    if (userType === 'wholesaler') {
      cartWhere = { wholesaler_id: userId };
    } else {
      cartWhere = { customer_id: userId };
    }

    const cart = await Cart.findOne({ where: cartWhere });
    if (!cart) {
        return res.status(404).json({ message: 'Cart not found' });
    }

    const normalizedVariantId =
      variant_id === undefined || variant_id === null || variant_id === ''
        ? null
        : Number.isNaN(Number(variant_id))
        ? null
        : Number(variant_id);

    const destroyWhere = {
      cart_id: cart.id,
      product_id: product_id,
    };
    if (normalizedVariantId === null) {
      destroyWhere.variant_id = null;
    } else {
      destroyWhere.variant_id = normalizedVariantId;
    }

    const deleted = await CartItem.destroy({ where: destroyWhere });

    if (deleted) {
        res.status(200).json({ message: 'Item removed from cart' });
    } else {
        res.status(404).json({ message: 'Item not found in cart' });
    }

  } catch (error) {
    console.error('Remove from cart error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.clearCart = async (req, res) => {
  try {
    const userId = req.user.id;
    const userType = req.userType;

    let cartWhere = {};
    if (userType === 'wholesaler') {
      cartWhere = { wholesaler_id: userId };
    } else {
      cartWhere = { customer_id: userId };
    }

    const cart = await Cart.findOne({ where: cartWhere });
    if (cart) {
        await CartItem.destroy({
            where: { cart_id: cart.id }
        });
    }

    res.status(200).json({ message: 'Cart cleared' });
  } catch (error) {
    console.error('Clear cart error:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
