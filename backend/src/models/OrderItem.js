const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const OrderItem = sequelize.define('OrderItem', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  order_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'orders',
      key: 'id'
    },
    onDelete: 'CASCADE'
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: true, // Product might be deleted later, but we need history. Though FK usually enforces. Let's keep it nullable if product is deleted? No, standard is FK.
    references: {
      model: 'products',
      key: 'id'
    }
  },
  variant_id: {
    type: DataTypes.INTEGER,
    allowNull: true,
    references: {
      model: 'product_variants',
      key: 'id',
    },
    comment: 'Foreign key snapshot. Variant may be deleted later but order history must remain.',
  },
  variant_name: {
    type: DataTypes.STRING(100),
    allowNull: true,
    comment: 'Snapshot of variant_value (e.g. "500g" or "Size M") for invoice/order history display.',
  },
  product_name: {
    type: DataTypes.STRING,
    allowNull: false,
    comment: 'Snapshot of product name'
  },
  quantity: {
    type: DataTypes.INTEGER,
    allowNull: false,
    validate: {
      min: 1
    }
  },
  price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: false,
    comment: 'Price at the time of purchase'
  }
}, {
  tableName: 'order_items',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = OrderItem;
