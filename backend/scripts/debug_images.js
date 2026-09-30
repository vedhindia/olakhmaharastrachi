const { Product, ProductImage } = require('../src/models');
const sequelize = require('../src/config/database');

(async () => {
  try {
    await sequelize.authenticate();
    console.log('Database connected.');

    const products = await Product.findAll({
      include: [{
        model: ProductImage,
        as: 'images'
      }]
    });

    console.log('Found', products.length, 'products.');

    products.forEach(p => {
      console.log(`Product: ${p.id} - ${p.name}`);
      if (p.images && p.images.length > 0) {
        p.images.forEach(img => {
          console.log(`  Image: ${img.id} - ${img.image_url} (Primary: ${img.is_primary})`);
        });
      } else {
        console.log('  No images found.');
      }
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await sequelize.close();
  }
})();
