const { Product, ProductImage } = require('../src/models');
const sequelize = require('../src/config/database');
const { Op } = require('sequelize');

async function fixProductImages() {
  try {
    // await sequelize.authenticate(); // Assume connection is handled by caller if imported
    console.log('Running fixProductImages...');

    // Define mappings for the products shown in the screenshot
    // Using LIKE patterns to match product names
    const mappings = [
      {
        pattern: '%Premium%Besan%',
        image: 'uploads/premium-besan.jpg'
      },
      {
        pattern: '%Fine%Gram%Flour%',
        image: 'uploads/fine-gram-flour.jpg'
      },
      {
        pattern: '%Roasted%Besan%',
        image: 'uploads/roasted-besan.jpg'
      },
      {
        pattern: '%Superfine%Besan%',
        image: 'uploads/superfine-besan.jpg'
      },
      {
        pattern: '%Low%Oil%Besan%',
        image: 'uploads/low-oil-besan.jpg'
      }
    ];

    for (const mapping of mappings) {
      const products = await Product.findAll({
        where: {
          name: { [Op.like]: mapping.pattern }
        }
      });

      if (products.length === 0) {
        // console.log(`No products found matching pattern: ${mapping.pattern}`);
        continue;
      }

      console.log(`Found ${products.length} products matching ${mapping.pattern}`);

      for (const product of products) {
        // Check if correct image already exists to avoid unnecessary writes
        const existingImage = await ProductImage.findOne({
             where: { 
                 product_id: product.id,
                 image_url: mapping.image
             }
        });
        
        if (existingImage) {
            console.log(`Product ${product.id} already has correct image.`);
            continue;
        }

        // Delete existing images for this product to avoid duplicates/placeholders
        const deletedCount = await ProductImage.destroy({
          where: { product_id: product.id }
        });
        console.log(`Deleted ${deletedCount} existing images for product ${product.id}`);

        // Create new image entry
        await ProductImage.create({
          product_id: product.id,
          image_url: mapping.image,
          is_primary: true,
          sort_order: 0
        });

        console.log(`Updated image for product: ${product.name} (ID: ${product.id}) -> ${mapping.image}`);
      }
    }

    console.log('Image update process complete.');

  } catch (error) {
    console.error('Error updating images:', error);
  }
}

if (require.main === module) {
    // If run directly via node scripts/fix_product_images.js
    (async () => {
        try {
            await sequelize.authenticate();
            console.log('Database connected.');
            await fixProductImages();
        } catch (error) {
            console.error('Database connection failed:', error);
        } finally {
            await sequelize.close();
        }
    })();
} else {
    // If imported
    module.exports = fixProductImages;
}
