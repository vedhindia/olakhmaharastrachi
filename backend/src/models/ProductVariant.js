const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const ProductVariant = sequelize.define('ProductVariant', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true,
  },
  product_id: {
    type: DataTypes.INTEGER,
    allowNull: false,
    references: {
      model: 'products',
      key: 'id',
    },
    onDelete: 'CASCADE',
  },
  variant_value: {
    type: DataTypes.STRING(100),
    allowNull: false,
    comment: 'e.g. "100g", "500g", "1kg", "S", "M", "L", "XL"',
  },
  sku: {
    type: DataTypes.STRING(100),
    allowNull: true,
    unique: false,
  },
  customer_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'If null, fall back to product-level customer_price',
  },
  wholesaler_price: {
    type: DataTypes.DECIMAL(10, 2),
    allowNull: true,
    comment: 'If null, fall back to product-level wholesaler_price',
  },
  stock: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
    comment: 'Per-variant stock. If variants exist, this is used instead of product stock.',
  },
  sort_order: {
    type: DataTypes.INTEGER,
    defaultValue: 0,
  },
  status: {
    type: DataTypes.ENUM('active', 'inactive'),
    defaultValue: 'active',
  },
}, {
  tableName: 'product_variants',
  underscored: true,
  timestamps: true,
  createdAt: 'created_at',
  updatedAt: 'updated_at',
});

module.exports = ProductVariant;
