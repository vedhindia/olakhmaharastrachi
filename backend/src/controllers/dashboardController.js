
const { Product, Category, Order, User, Wholesaler } = require('../models');
const { Op, fn, col, where } = require('sequelize');

const COD_METHODS = ['cod', 'cash on delivery', 'cash_on_delivery'];

const isCodMethodWhere = () =>
  where(fn('LOWER', col('payment_method')), {
    [Op.in]: COD_METHODS,
  });

const isOnlineMethodWhere = () =>
  where(fn('LOWER', col('payment_method')), {
    [Op.notIn]: COD_METHODS,
  });

const buildPublicOrderId = (order) => {
  if (!order || !order.id) return null;
  const numericId = Number(order.id);
  if (!Number.isFinite(numericId) || numericId <= 0) return String(order.id);
  const padded = String(numericId).padStart(6, '0');

  const hasWholesaler =
    (order.wholesaler_id && Number(order.wholesaler_id) > 0) ||
    (order.wholesaler && (order.wholesaler.id || order.wholesaler.business_name));

  if (hasWholesaler) {
    return `W${padded}`;
  }

  return `U${padded}`;
};

exports.getDashboardStats = async (req, res) => {
  try {
    const productCount = await Product.count();
    const categoryCount = await Category.count();
    const userCount = await User.count();
    const wholesalerCount = await Wholesaler.count();

    const totalOrders = await Order.count();
    
    const [onlineRevenueRaw, codRevenueRaw] = await Promise.all([
      Order.sum('total_amount', {
        where: {
          payment_status: 'paid',
          [Op.and]: [isOnlineMethodWhere()],
        },
      }),
      Order.sum('total_amount', {
        where: {
          status: 'delivered',
          [Op.and]: [isCodMethodWhere()],
        },
      }),
    ]);
    const totalRevenue = Number(onlineRevenueRaw || 0) + Number(codRevenueRaw || 0);

    // Low Stock Products (< 10)
    const lowStockCount = await Product.count({
      where: {
        stock: { [Op.lt]: 10 }
      }
    });

    // Recent 5 Orders
    const recentOrdersRaw = await Order.findAll({
      limit: 5,
      order: [['created_at', 'DESC']],
      include: [
        { model: User, as: 'customer', attributes: ['name'] },
        { model: Wholesaler, as: 'wholesaler', attributes: ['business_name'] }
      ]
    });

    const recentOrders = recentOrdersRaw.map((o) => {
      const plain = o.toJSON();
      return {
        ...plain,
        display_order_id: buildPublicOrderId(plain),
      };
    });

    res.json({
      totalProducts: productCount,
      totalCategories: categoryCount,
      totalUsers: userCount,
      totalWholesalers: wholesalerCount,
      totalOrders,
      totalRevenue,
      lowStockCount,
      recentOrders
    });
  } catch (error) {
    console.error('Error fetching dashboard stats:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getRevenueBreakdown = async (req, res) => {
  try {
    const limitRaw = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(limitRaw) && limitRaw > 0 ? Math.min(limitRaw, 200) : 50;

    const [onlineRevenueRaw, codRevenueRaw, onlineCount, codCount] = await Promise.all([
      Order.sum('total_amount', {
        where: {
          payment_status: 'paid',
          [Op.and]: [isOnlineMethodWhere()],
        },
      }),
      Order.sum('total_amount', {
        where: {
          status: 'delivered',
          [Op.and]: [isCodMethodWhere()],
        },
      }),
      Order.count({
        where: {
          payment_status: 'paid',
          [Op.and]: [isOnlineMethodWhere()],
        },
      }),
      Order.count({
        where: {
          status: 'delivered',
          [Op.and]: [isCodMethodWhere()],
        },
      }),
    ]);

    const onlineRevenue = Number(onlineRevenueRaw || 0);
    const codRevenue = Number(codRevenueRaw || 0);
    const totalRevenue = onlineRevenue + codRevenue;

    const [onlineOrdersRaw, codOrdersRaw] = await Promise.all([
      Order.findAll({
        limit,
        order: [['created_at', 'DESC']],
        where: {
          payment_status: 'paid',
          [Op.and]: [isOnlineMethodWhere()],
        },
        include: [
          { model: User, as: 'customer', attributes: ['name'] },
          { model: Wholesaler, as: 'wholesaler', attributes: ['business_name'] },
        ],
      }),
      Order.findAll({
        limit,
        order: [['created_at', 'DESC']],
        where: {
          status: 'delivered',
          [Op.and]: [isCodMethodWhere()],
        },
        include: [
          { model: User, as: 'customer', attributes: ['name'] },
          { model: Wholesaler, as: 'wholesaler', attributes: ['business_name'] },
        ],
      }),
    ]);

    const mapOrder = (o) => {
      const plain = o.toJSON();
      return {
        id: plain.id,
        display_order_id: buildPublicOrderId(plain),
        total_amount: Number(plain.total_amount || 0),
        status: plain.status,
        payment_method: plain.payment_method,
        payment_status: plain.payment_status,
        created_at: plain.created_at,
        customer: plain.customer ? { name: plain.customer.name } : null,
        wholesaler: plain.wholesaler ? { business_name: plain.wholesaler.business_name } : null,
      };
    };

    res.json({
      totalRevenue,
      online: {
        revenue: onlineRevenue,
        count: onlineCount,
        orders: onlineOrdersRaw.map(mapOrder),
      },
      cod: {
        revenue: codRevenue,
        count: codCount,
        orders: codOrdersRaw.map(mapOrder),
      },
    });
  } catch (error) {
    console.error('Error fetching revenue breakdown:', error);
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
