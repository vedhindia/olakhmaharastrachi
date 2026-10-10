
const { Sequelize } = require('sequelize');
require('dotenv').config();

const isProduction = process.env.NODE_ENV === 'production';

const requiredVars = [
  'DB_NAME',
  'DB_USER',
  'DB_PASSWORD',
  'DB_HOST',
];

if (isProduction) {
  const missingVars = requiredVars.filter(
    (name) => !process.env[name]
  );

  if (missingVars.length > 0) {
    throw new Error(
      `Missing required production environment variables: ${missingVars.join(', ')}`
    );
  }
}

const dbName = process.env.DB_NAME || 'ecommerce_ashoka';
const dbUser = process.env.DB_USER || 'root';
const dbPassword = process.env.DB_PASSWORD || '';
const dbHost = process.env.DB_HOST || 'localhost';
const dbDialect = process.env.DB_DIALECT?.trim() || 'mysql';
const dbPort = Number(process.env.DB_PORT || 3306);

const sequelize = new Sequelize(
  dbName,
  dbUser,
  dbPassword,
  {
    host: dbHost,
    port: dbPort,
    dialect: dbDialect,
    logging: false,
  }
);

module.exports = sequelize;
