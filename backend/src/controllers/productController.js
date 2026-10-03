const { Product, ProductImage, Category, ProductVariant } = require('../models');
const sequelize = require('../config/database');
const { QueryTypes } = require('sequelize');

// Cache product table columns to build portable queries across differing schemas
let productColumnsCache = null;
const ensureProductColumns = async () => {
  if (productColumnsCache) return productColumnsCache;
  try {
    const rows = await sequelize.query(
      `SELECT COLUMN_NAME AS name
       FROM INFORMATION_SCHEMA.COLUMNS
       WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'products'`,
      { type: QueryTypes.SELECT }
    );
    productColumnsCache = new Set(rows.map(r => r.name));
  } catch {
    productColumnsCache = new Set(); // fallback: unknown schema
  }
  return productColumnsCache;
};
const { Op } = require('sequelize');
const fs = require('fs');
const path = require('path');

const normalizeUploadPath = (filePath) => {
  if (!filePath || typeof filePath !== 'string') return filePath;
  const normalized = filePath.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized);
  return `/uploads/${baseName}`;
};

const normalizeStoredImageUrl = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return imageUrl;
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) {
    return imageUrl;
  }
  const normalized = imageUrl.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized);
  return `/uploads/${baseName}`;
};

const resolveImageFileCandidates = (imageUrl) => {
  if (!imageUrl || typeof imageUrl !== 'string') return [];
  if (imageUrl.startsWith('http://') || imageUrl.startsWith('https://')) return [];
  const normalized = imageUrl.replace(/\\/g, '/');
  const baseName = path.posix.basename(normalized);
  const envDir = process.env.UPLOADS_DIR ? path.resolve(process.env.UPLOADS_DIR) : null;
  const defaultRootUploadsDir = path.resolve(__dirname, '../../../uploads');
  const backendUploadsDir = path.resolve(__dirname, '../../uploads');
  const cwdUploadsDir = path.resolve(process.cwd(), 'uploads');

  return Array.from(
    new Set(
      [envDir, defaultRootUploadsDir, backendUploadsDir, cwdUploadsDir]
        .filter(Boolean)
        .map((dir) => path.join(dir, baseName))
    )
  );
};

const safeUnlinkImage = (imageUrl) => {
  const candidates = resolveImageFileCandidates(imageUrl);
  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        fs.unlinkSync(candidate);
        return true;
      }
    } catch {
    }
  }
  return false;
};

const parseVariantsJson = (raw) => {
  if (!raw) return null;
  if (Array.isArray(raw)) return raw;
  if (typeof raw !== 'string') return null;
  const trimmed = raw.trim();
  if (!trimmed) return null;
  try {
    const parsed = JSON.parse(trimmed);
    return Array.isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
};

const normalizeVariant = (raw, index) => {
  if (!raw || typeof raw !== 'object') return null;
  const variant_value = typeof raw.variant_value === 'string' ? raw.variant_value.trim() : String(raw.variant_value || '').trim();
  if (!variant_value) return null;
  const skuRaw = typeof raw.sku === 'string' ? raw.sku.trim() : (raw.sku ? String(raw.sku) : '');
  const sku = skuRaw === '' ? null : skuRaw;
  let customer_price = null;
  if (raw.customer_price !== undefined && raw.customer_price !== null && raw.customer_price !== '') {
    const p = parseFloat(raw.customer_price);
    if (!Number.isNaN(p)) customer_price = p;
  }
  let wholesaler_price = null;
  if (raw.wholesaler_price !== undefined && raw.wholesaler_price !== null && raw.wholesaler_price !== '') {
    const p = parseFloat(raw.wholesaler_price);
    if (!Number.isNaN(p)) wholesaler_price = p;
  }
  let stock = 0;
  if (raw.stock !== undefined && raw.stock !== null && raw.stock !== '') {
    const s = parseInt(raw.stock, 10);
    stock = Number.isNaN(s) ? 0 : Math.max(0, s);
  }
  const status = (raw.status === 'true' || raw.status === true || raw.status === 'active') ? 'active' : 'inactive';
  const sort_order = typeof raw.sort_order === 'number' ? raw.sort_order : (Number.isFinite(Number(raw.sort_order)) ? Number(raw.sort_order) : index);
  const id = raw.id ? (Number.isNaN(Number(raw.id)) ? null : Number(raw.id)) : null;
  return {
    id,
    variant_value,
    sku,
    customer_price,
    wholesaler_price,
    stock,
    status,
    sort_order,
  };
};

const createOrReplaceVariants = async (productId, rawVariants) => {
  const parsed = parseVariantsJson(rawVariants);
  if (!parsed) return { created: 0, replaced: false };
  const normalized = parsed.map((v, i) => normalizeVariant(v, i)).filter(Boolean);
  await ProductVariant.destroy({ where: { product_id: productId } });
  if (normalized.length === 0) return { created: 0, replaced: true };
  const rows = normalized.map((v) => ({
    product_id: productId,
    variant_value: v.variant_value,
    sku: v.sku,
    customer_price: v.customer_price,
    wholesaler_price: v.wholesaler_price,
    stock: v.stock,
    status: v.status,
    sort_order: v.sort_order,
  }));
  await ProductVariant.bulkCreate(rows);
  return { created: rows.length, replaced: true };
};

const attachVariantsAndEffectivePricing = (productJson) => {
  if (!productJson) return productJson;
  const variants = Array.isArray(productJson.variants) ? productJson.variants : [];
  const hasVariants = variants.length > 0;
  productJson.has_variants = hasVariants;
  if (!hasVariants) {
    productJson.effective_stock = productJson.stock ?? 0;
    productJson.min_customer_price = productJson.customer_price ?? null;
    productJson.max_customer_price = productJson.customer_price ?? null;
    productJson.min_wholesaler_price = productJson.wholesaler_price ?? null;
    productJson.max_wholesaler_price = productJson.wholesaler_price ?? null;
    return productJson;
  }
  let minC = null, maxC = null, minW = null, maxW = null;
  let totalStock = 0;
  for (const v of variants) {
    if (v.status === 'inactive') continue;
    totalStock += Number(v.stock || 0);
    const cp = v.customer_price ?? productJson.customer_price ?? null;
    const wp = v.wholesaler_price ?? productJson.wholesaler_price ?? null;
    if (cp !== null && cp !== undefined) {
      if (minC === null || cp < minC) minC = cp;
      if (maxC === null || cp > maxC) maxC = cp;
    }
    if (wp !== null && wp !== undefined) {
      if (minW === null || wp < minW) minW = wp;
      if (maxW === null || wp > maxW) maxW = wp;
    }
  }
  productJson.effective_stock = totalStock;
  productJson.min_customer_price = minC;
  productJson.max_customer_price = maxC;
  productJson.min_wholesaler_price = minW;
  productJson.max_wholesaler_price = maxW;
  return productJson;
};

exports.createProduct = async (req, res) => {
  try {
    // Extract fields from request body with fallback for alternative field names
    const body = req.body;
    const name = (body.name || body.product_name || '').trim();
    const category_id = body.category_id;
    const description = body.description || body.short_description || body.full_description;
    const skuRaw = (body.sku || body.slug || '').trim(); // slug is sometimes used as sku
    const customer_price_raw = body.customer_price ?? body.mrp_price ?? body.selling_price;
    const wholesaler_price_raw = body.wholesaler_price ?? body.doctor_price;
    const stock_raw = body.stock ?? body.stock_quantity;
    let customer_price = customer_price_raw === undefined || customer_price_raw === '' ? null : parseFloat(customer_price_raw);
    let wholesaler_price = wholesaler_price_raw === undefined || wholesaler_price_raw === '' ? null : parseFloat(wholesaler_price_raw);
    let stock = stock_raw === undefined || stock_raw === '' ? 0 : parseInt(stock_raw, 10);
    if (Number.isNaN(customer_price)) customer_price = null;
    if (Number.isNaN(wholesaler_price)) wholesaler_price = null;
    if (Number.isNaN(stock)) stock = 0;
    const status = body.status;

    // Validate required fields
    if (!name) {
        return res.status(400).json({ message: 'Product name is required' });
    }
    if (!category_id) {
        return res.status(400).json({ message: 'Category is required' });
    }
    const categoryIdNum = parseInt(category_id, 10);
    if (Number.isNaN(categoryIdNum)) {
        return res.status(400).json({ message: 'Category must be a valid number' });
    }

    // Ensure category exists to avoid FK errors
    const category = await Category.findByPk(categoryIdNum);
    if (!category) {
      return res.status(400).json({ message: 'Selected category does not exist' });
    }

    // Normalize empty SKU to null to avoid duplicate '' constraint errors
    const sku = skuRaw === '' ? null : skuRaw;

    // Proactively prevent duplicate SKU errors
    if (sku !== null) {
        const existing = await Product.findOne({ where: { sku } });
        if (existing) {
            return res.status(409).json({ message: 'SKU already exists. Please use a unique SKU.' });
        }
    }

    const product = await Product.create({
        category_id: categoryIdNum,
        name,
        description,
        sku,
        customer_price,
        wholesaler_price,
        stock,
        status: (status === 'true' || status === true || status === 'active') ? 'active' : 'inactive',
        created_by: req.admin ? req.admin.id : null
    });

    // Handle main image (is_primary = true) - support 'main_image' or 'image'
    const mainFile =
      (req.files && req.files['main_image'] && req.files['main_image'][0]) ||
      (req.files && req.files['image'] && req.files['image'][0]);
    if (mainFile) {
        try {
          await ProductImage.create({
              product_id: product.id,
              image_url: normalizeUploadPath(mainFile.path),
              is_primary: true,
              sort_order: 0
          });
        } catch (imgErr) {
          console.error('Main image save failed:', imgErr);
        }
    }

    // Handle additional product images (is_primary = false)
    const extraFiles =
      (req.files && req.files['images']) ||
      (req.files && req.files['images[]']) ||
      [];
    if (extraFiles && extraFiles.length) {
        const tasks = extraFiles.map((file, index) => (async () => {
          try {
            await ProductImage.create({
              product_id: product.id,
              image_url: normalizeUploadPath(file.path),
              is_primary: false,
              sort_order: index + 1
            });
          } catch (imgErr) {
            console.error('Additional image save failed:', imgErr);
          }
        })());
        await Promise.allSettled(tasks);
    }

    // Handle product variants (from multipart form as JSON string under "variants" field)
    try {
      const rawVariants =
        (req.body && req.body.variants) ||
        (req.body && req.body.variants_json) ||
        null;
      await createOrReplaceVariants(product.id, rawVariants);
    } catch (variantErr) {
      console.error('Variant creation failed (non-fatal):', variantErr);
    }

    // Reload product to include images + variants (best effort)
    try {
      const createdProduct = await Product.findByPk(product.id, {
          include: [
            { model: ProductImage, as: 'images' },
            { model: ProductVariant, as: 'variants', order: [['sort_order', 'ASC'], ['id', 'ASC']] }
          ]
      });
      const payload = createdProduct ? createdProduct.toJSON() : product;
      attachVariantsAndEffectivePricing(payload);
      return res.status(201).json(payload);
    } catch (e) {
      console.error('Post-create reload failed:', e);
      return res.status(201).json(product);
    }
  } catch (error) {
    // Cleanup uploaded files if error
    if (req.files) {
        Object.values(req.files).flat().forEach(file => {
             try { fs.unlinkSync(file.path); } catch(e) {}
        });
    }
    console.error('Error in createProduct:', error);
    if (error.name === 'SequelizeUniqueConstraintError') {
      return res.status(409).json({ message: 'SKU already exists. Please use a unique SKU.' });
    }
    if (error.name === 'SequelizeForeignKeyConstraintError') {
      return res.status(400).json({ message: 'Invalid category. Please select a valid category.' });
    }
    // Common MySQL/Sequelize database errors mapped to 400 for clearer feedback
    const code = error?.parent?.code || error?.original?.code;
    const sqlMessage = error?.parent?.sqlMessage || error?.original?.sqlMessage || error.message;
    if (code === 'ER_NO_DEFAULT_FOR_FIELD' || code === 'ER_BAD_NULL_ERROR') {
      return res.status(400).json({ message: `Missing required field in database: ${sqlMessage}` });
    }
    if (code === 'ER_TRUNCATED_WRONG_VALUE' || code === 'ER_TRUNCATED_WRONG_VALUE_FOR_FIELD') {
      return res.status(400).json({ message: `Invalid value for a numeric/date field: ${sqlMessage}` });
    }
    if (code === 'ER_DATA_TOO_LONG') {
      return res.status(400).json({ message: `One of the inputs is too long: ${sqlMessage}` });
    }
    if (code === 'ER_BAD_FIELD_ERROR') {
      return res.status(400).json({ message: `Unknown database field: ${sqlMessage}` });
    }
    res.status(500).json({ message: 'Server error', error: sqlMessage });
  }
};

exports.getAllProducts = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const parsedLimit = parseInt(req.query.limit, 10);
    const limit = Number.isFinite(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 100) : 20;
    const search = req.query.search || '';
    const offset = (page - 1) * limit;
    const rawCategoryId =
      req.query.category_id ?? req.query.categoryId ?? req.query.category ?? null;
    const categoryId = rawCategoryId !== null ? parseInt(rawCategoryId, 10) : NaN;
    const hasCategory = Number.isFinite(categoryId) && categoryId > 0;
    const whereParts = ['p.name LIKE :search'];
    if (hasCategory) {
      whereParts.push('p.category_id = :categoryId');
    }
    const whereSql = `WHERE ${whereParts.join(' AND ')}`;

    // Total count for pagination and to preserve existing UI behavior
    const countRow = await sequelize.query(
      `
      SELECT COUNT(1) AS total
      FROM products p
      ${whereSql}
      `,
      {
        replacements: { search: `%${search}%`, ...(hasCategory ? { categoryId } : {}) },
        type: QueryTypes.SELECT,
      }
    );
    const total = Number(countRow?.[0]?.total || 0);

    const sql = `
      SELECT 
        p.id,
        p.category_id,
        p.name,
        p.description,
        p.sku,
        p.customer_price,
        p.wholesaler_price,
        p.stock,
        p.status,
        p.created_at,
        p.updated_at,
        c.id AS cat_id,
        c.category_name,
        c.slug AS category_slug
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereSql}
      ORDER BY p.created_at DESC
      LIMIT :limit OFFSET :offset
    `;

    const rows = await sequelize.query(sql, {
      replacements: {
        search: `%${search}%`,
        limit,
        offset,
        ...(hasCategory ? { categoryId } : {}),
      },
      type: QueryTypes.SELECT,
    });

    // Attach images array for each product from product_images table
    const ids = rows.map(p => p.id);
    if (ids.length) {
      try {
        const imgRows = await sequelize.query(
          `
          SELECT id, product_id, image_url, is_primary, sort_order
          FROM product_images
          WHERE product_id IN (:ids)
          ORDER BY is_primary DESC, sort_order ASC, id ASC
          `,
          { replacements: { ids }, type: QueryTypes.SELECT }
        );
        const byPid = imgRows.reduce((acc, r) => {
          const arr = acc[r.product_id] || [];
          arr.push({
            id: r.id,
            product_id: r.product_id,
            image_url: normalizeStoredImageUrl(r.image_url),
            is_primary: !!r.is_primary,
            sort_order: r.sort_order ?? 0,
          });
          acc[r.product_id] = arr;
          return acc;
        }, {});
        rows.forEach(p => {
          p.images = byPid[p.id] || [];
        });
      } catch {
        rows.forEach(p => { p.images = []; });
      }

      try {
        const varRows = await sequelize.query(
          `
          SELECT id, product_id, variant_value, sku, customer_price, wholesaler_price, stock, sort_order, status
          FROM product_variants
          WHERE product_id IN (:ids)
          ORDER BY sort_order ASC, id ASC
          `,
          { replacements: { ids }, type: QueryTypes.SELECT }
        );
        const varsByPid = varRows.reduce((acc, r) => {
          const arr = acc[r.product_id] || [];
          arr.push({
            id: r.id,
            product_id: r.product_id,
            variant_value: r.variant_value,
            sku: r.sku,
            customer_price: r.customer_price,
            wholesaler_price: r.wholesaler_price,
            stock: Number(r.stock ?? 0),
            sort_order: r.sort_order ?? 0,
            status: r.status || 'active',
          });
          acc[r.product_id] = arr;
          return acc;
        }, {});
        rows.forEach(p => {
          p.variants = varsByPid[p.id] || [];
          attachVariantsAndEffectivePricing(p);
        });
      } catch {
        rows.forEach(p => {
          p.variants = [];
          attachVariantsAndEffectivePricing(p);
        });
      }

    } else {
      rows.forEach(p => {
        p.images = [];
        p.variants = [];
        attachVariantsAndEffectivePricing(p);
      });
    }

    // Preserve previous UI contract by providing legacy-friendly fields
    const products = rows.map(p => {
      const images = Array.isArray(p.images) ? p.images : [];
      const primary = images.find(i => i.is_primary) || images[0] || null;
      const variants = Array.isArray(p.variants) ? p.variants : [];
      return {
        ...p,
        product_name: p.name,            // legacy alias
        stock_quantity: p.effective_stock ?? p.stock,         // legacy alias (now = effective stock across variants)
        main_image: primary ? primary.image_url : null, // used by table thumbnail
        mrp_price: null,                 // not in schema; keep key for UI layout
        selling_price: null,             // not in schema; keep key for UI layout
        has_variants: variants.length > 0,
        variants,
      };
    });

    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, limit)));
    res.json({
      products,
      total,
      totalPages,
      currentPage: page,
      limit,        // extra metadata to help UI render ranges (1–10, etc.)
      pageSize: limit, // alias for some UIs
    });
  } catch (error) {
    console.error('Error in getAllProducts:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

exports.getLowStockProductsAdmin = async (req, res) => {
  try {
    const rawThreshold = parseInt(req.query.threshold, 10);
    const threshold = Number.isFinite(rawThreshold) && rawThreshold >= 0 ? rawThreshold : 10;

    const columns = await ensureProductColumns();
    const stockCol = columns.has('stock') ? 'stock' : (columns.has('stock_quantity') ? 'stock_quantity' : 'stock');
    const nameCol = columns.has('name') ? 'name' : (columns.has('product_name') ? 'product_name' : 'name');
    const skuCol = columns.has('sku') ? 'sku' : (columns.has('slug') ? 'slug' : null);
    const statusCol = columns.has('status') ? 'status' : null;

    const whereParts = [`p.\`${stockCol}\` < :threshold`];
    if (statusCol) {
      whereParts.push(`(p.\`${statusCol}\` = 'active' OR p.\`${statusCol}\` = 1)`);
    }

    const sql = `
      SELECT
        p.id,
        p.\`${nameCol}\` AS name,
        ${skuCol ? `p.\`${skuCol}\` AS sku,` : `NULL AS sku,`}
        p.\`${stockCol}\` AS stock
      FROM products p
      WHERE ${whereParts.join(' AND ')}
      ORDER BY p.\`${stockCol}\` ASC, p.id ASC
      LIMIT 50
    `;

    const products = await sequelize.query(sql, {
      replacements: { threshold },
      type: QueryTypes.SELECT,
    });

    res.status(200).json({
      threshold,
      count: products.length,
      products: products.map((p) => ({
        id: p.id,
        name: p.name || '',
        sku: p.sku,
        stock: p.stock === null || p.stock === undefined ? null : Number(p.stock),
      })),
    });
  } catch (error) {
    console.error('Error in getLowStockProductsAdmin:', error);
    res.status(500).json({ message: 'Server Error', error: error.message });
  }
};

exports.getProductById = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!id) return res.status(400).json({ message: 'Invalid product id' });

    const rowSql = `
      SELECT 
        p.*,
        c.id AS cat_id,
        c.category_name,
        c.slug AS category_slug,
        c.variant_type,
        c.status AS category_status,
        c.created_at AS category_created_at,
        c.updated_at AS category_updated_at
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      WHERE p.id = :id
      LIMIT 1
    `;
    const rows = await sequelize.query(rowSql, {
      replacements: { id },
      type: QueryTypes.SELECT,
    });
    if (!rows.length) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const r = rows[0];

    const imgSql = `
      SELECT id, product_id, image_url, is_primary, sort_order, created_at
      FROM product_images
      WHERE product_id = :id
      ORDER BY is_primary DESC, sort_order ASC, id ASC
    `;
    let imgs = [];
    try {
      imgs = await sequelize.query(imgSql, {
        replacements: { id },
        type: QueryTypes.SELECT,
      });
    } catch {
      imgs = [];
    }
    const images = imgs.map(img => ({
      id: img.id,
      product_id: img.product_id,
      image_url: normalizeStoredImageUrl(img.image_url),
      is_primary: !!img.is_primary,
      sort_order: img.sort_order ?? 0,
      created_at: img.created_at,
    }));
    if (!images.length && r.main_image) {
      images.push({
        id: null,
        product_id: r.id,
        image_url: normalizeStoredImageUrl(r.main_image),
        is_primary: true,
        sort_order: 0,
        created_at: r.created_at,
      });
    }

    const varSql = `
      SELECT id, product_id, variant_value, sku, customer_price, wholesaler_price, stock, sort_order, status, created_at, updated_at
      FROM product_variants
      WHERE product_id = :id
      ORDER BY sort_order ASC, id ASC
    `;
    let varRows = [];
    try {
      varRows = await sequelize.query(varSql, { replacements: { id }, type: QueryTypes.SELECT });
    } catch {
      varRows = [];
    }
    const variants = varRows.map(v => ({
      id: v.id,
      product_id: v.product_id,
      variant_value: v.variant_value,
      sku: v.sku,
      customer_price: v.customer_price,
      wholesaler_price: v.wholesaler_price,
      stock: Number(v.stock ?? 0),
      sort_order: v.sort_order ?? 0,
      status: v.status || 'active',
      created_at: v.created_at,
      updated_at: v.updated_at,
    }));

    const payload = {
      id: r.id,
      category_id: r.category_id,
      name: r.name || r.product_name || '',
      product_name: r.product_name || r.name || '',
      description: r.description || null,
      sku: r.sku || null,
      customer_price: r.customer_price ?? r.mrp_price ?? r.selling_price ?? null,
      wholesaler_price: r.wholesaler_price ?? r.doctor_price ?? null,
      mrp_price: r.mrp_price ?? null,
      selling_price: r.selling_price ?? null,
      doctor_price: r.doctor_price ?? null,
      stock: r.stock ?? r.stock_quantity ?? 0,
      main_image: r.main_image || null,
      status: r.status,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
      category: r.cat_id
        ? {
            id: r.cat_id,
            category_name: r.category_name,
            slug: r.category_slug,
            variant_type: r.variant_type || 'none',
            status: r.category_status,
            createdAt: r.category_created_at,
            updatedAt: r.category_updated_at,
          }
        : null,
      images,
      variants,
    };
    attachVariantsAndEffectivePricing(payload);
    res.json(payload);
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

// Role-aware pricing: returns effective_price based on authenticated viewer (customer/wholesaler)
exports.getAllProductsPriced = async (req, res) => {
  try {
    const { search, page = 1, limit = 10 } = req.query;
    const pg = Math.max(1, parseInt(page, 10) || 1);
    const lm = Math.max(1, parseInt(limit, 10) || 10);
    const ofs = (pg - 1) * lm;

    const userType = req.userType;

    const cols = await ensureProductColumns();
    const conditions = [];
    const params = {};
    if (cols.has('status')) {
      conditions.push('(p.status IS NULL OR p.status = 1 OR p.status = TRUE OR p.status = "active")');
    }
    if (search && String(search).trim() !== '') {
      const parts = [];
      if (cols.has('name')) parts.push('p.name LIKE :q');
      if (cols.has('product_name')) parts.push('p.product_name LIKE :q');
      if (cols.has('sku')) parts.push('p.sku LIKE :q');
      if (cols.has('slug')) parts.push('p.slug LIKE :q');
      if (parts.length) {
        conditions.push(`(${parts.join(' OR ')})`);
        params.q = `%${search}%`;
      }
    }
    const whereSql = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countSql = `
      SELECT COUNT(1) AS total
      FROM products p
      ${whereSql}
    `;
    const [{ total }] = await sequelize.query(countSql, {
      replacements: params,
      type: QueryTypes.SELECT,
    });

    const listSql = `
      SELECT 
        p.*,
        c.id AS cat_id,
        c.category_name,
        c.slug AS category_slug,
        c.status AS category_status
      FROM products p
      LEFT JOIN categories c ON c.id = p.category_id
      ${whereSql}
      ORDER BY p.id DESC
      LIMIT :limit OFFSET :offset
    `;
    const rows = await sequelize.query(listSql, {
      replacements: { ...params, limit: lm, offset: ofs },
      type: QueryTypes.SELECT,
    });

    const ids = rows.map(r => r.id);
    let imagesByProduct = {};
    if (ids.length) {
      try {
        const imgSql = `
          SELECT id, product_id, image_url, is_primary, sort_order
          FROM product_images
          WHERE product_id IN (:ids)
          ORDER BY is_primary DESC, sort_order ASC, id ASC
        `;
        const imgs = await sequelize.query(imgSql, {
          replacements: { ids },
          type: QueryTypes.SELECT,
        });
        imagesByProduct = imgs.reduce((acc, img) => {
          const arr = acc[img.product_id] || [];
          arr.push({
            id: img.id,
            product_id: img.product_id,
            image_url: normalizeStoredImageUrl(img.image_url),
            is_primary: !!img.is_primary,
            sort_order: img.sort_order ?? 0,
          });
          acc[img.product_id] = arr;
          return acc;
        }, {});
      } catch {
        imagesByProduct = {};
      }
    }

    let variantsByProduct = {};
    if (ids.length) {
      try {
        const vSql = `
          SELECT id, product_id, variant_value, sku, customer_price, wholesaler_price, stock, sort_order, status
          FROM product_variants
          WHERE product_id IN (:ids)
          ORDER BY sort_order ASC, id ASC
        `;
        const vRows = await sequelize.query(vSql, { replacements: { ids }, type: QueryTypes.SELECT });
        variantsByProduct = vRows.reduce((acc, v) => {
          const arr = acc[v.product_id] || [];
          arr.push({
            id: v.id,
            product_id: v.product_id,
            variant_value: v.variant_value,
            sku: v.sku,
            customer_price: v.customer_price,
            wholesaler_price: v.wholesaler_price,
            stock: Number(v.stock ?? 0),
            sort_order: v.sort_order ?? 0,
            status: v.status || 'active',
          });
          acc[v.product_id] = arr;
          return acc;
        }, {});
      } catch {
        variantsByProduct = {};
      }
    }

    const products = rows.map(r => {
      const retail = r.customer_price ?? r.selling_price ?? r.mrp_price ?? 0;
      const wholesale = r.wholesaler_price ?? r.doctor_price ?? 0;
      const variants = variantsByProduct[r.id] || [];
      const images = imagesByProduct[r.id] || (r.main_image ? [{
        id: null, product_id: r.id, image_url: r.main_image, is_primary: true, sort_order: 0,
      }] : []);
      const temp = {
        variants,
        customer_price: retail,
        wholesaler_price: wholesale,
        stock: r.stock ?? r.stock_quantity ?? 0,
      };
      attachVariantsAndEffectivePricing(temp);
      const effectiveRetail = temp.min_customer_price ?? retail;
      const effectiveWholesale = temp.min_wholesaler_price ?? wholesale;
      const effective_price = userType === 'wholesaler'
        ? (Number(effectiveWholesale) || Number(effectiveRetail) || 0)
        : (Number(effectiveRetail) || 0);
      const price_type = userType === 'wholesaler' ? 'wholesaler' : 'customer';
      return {
        id: r.id,
        category_id: r.category_id,
        name: r.name || r.product_name || '',
        product_name: r.product_name || r.name || '',
        customer_price: r.customer_price ?? r.mrp_price ?? r.selling_price ?? null,
        wholesaler_price: r.wholesaler_price ?? r.doctor_price ?? null,
        mrp_price: r.mrp_price ?? null,
        selling_price: r.selling_price ?? null,
        doctor_price: r.doctor_price ?? null,
        main_image: r.main_image || null,
        status: r.status,
        stock: r.stock ?? r.stock_quantity ?? 0,
        category: r.cat_id ? { id: r.cat_id, category_name: r.category_name, slug: r.category_slug, variant_type: r.variant_type || 'none', status: r.category_status } : null,
        images,
        variants,
        has_variants: variants.length > 0,
        min_customer_price: temp.min_customer_price,
        max_customer_price: temp.max_customer_price,
        min_wholesaler_price: temp.min_wholesaler_price,
        max_wholesaler_price: temp.max_wholesaler_price,
        effective_stock: temp.effective_stock,
        effective_price,
        price_type,
      };
    });

    res.json({
      products,
      total: Number(total) || 0,
      totalPages: Math.ceil((Number(total) || 0) / lm),
      currentPage: pg,
    });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.getProductByIdPriced = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
      include: [
        { model: Category, as: 'category' },
        { model: ProductImage, as: 'images' },
        { model: ProductVariant, as: 'variants', order: [['sort_order', 'ASC'], ['id', 'ASC']] }
      ]
    });
    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }
    const data = product.toJSON();
    if (Array.isArray(data.images)) {
      data.images = data.images.map((img) => ({
        ...img,
        image_url: normalizeStoredImageUrl(img.image_url),
      }));
    }
    attachVariantsAndEffectivePricing(data);
    const userType = req.userType;
    const retailMin = data.min_customer_price ?? data.customer_price;
    const wholeMin = data.min_wholesaler_price ?? data.wholesaler_price;
    const effective_price = userType === 'wholesaler' ? wholeMin : retailMin;
    const price_type = userType === 'wholesaler' ? 'wholesaler' : 'customer';
    res.json({ ...data, effective_price, price_type });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.updateProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id);

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    const body = req.body || {};
    const {
      category_id,
      name,
      description,
      sku,
      customer_price,
      wholesaler_price,
      stock,
      status,
    } = body;

    const updates = {};

    if (typeof name !== 'undefined') updates.name = String(name).trim();
    if (typeof description !== 'undefined') updates.description = description === null ? null : String(description);

    if (typeof status !== 'undefined') {
      updates.status = (status === 'true' || status === true || status === 'active') ? 'active' : 'inactive';
    }

    if (typeof stock !== 'undefined') {
      const parsedStock = stock === '' || stock === null ? 0 : parseInt(stock, 10);
      if (Number.isNaN(parsedStock) || parsedStock < 0) {
        return res.status(400).json({ message: 'Stock must be a valid non-negative number' });
      }
      updates.stock = parsedStock;
    }

    if (typeof customer_price !== 'undefined') {
      const parsed = customer_price === '' || customer_price === null ? null : parseFloat(customer_price);
      if (parsed !== null && Number.isNaN(parsed)) {
        return res.status(400).json({ message: 'Customer price must be a valid number' });
      }
      updates.customer_price = parsed;
    }

    if (typeof wholesaler_price !== 'undefined') {
      const parsed = wholesaler_price === '' || wholesaler_price === null ? null : parseFloat(wholesaler_price);
      if (parsed !== null && Number.isNaN(parsed)) {
        return res.status(400).json({ message: 'Wholesaler price must be a valid number' });
      }
      updates.wholesaler_price = parsed;
    }

    if (typeof sku !== 'undefined') {
      const skuTrimmed = sku === null ? null : String(sku).trim();
      const skuNormalized = skuTrimmed === '' ? null : skuTrimmed;
      if (skuNormalized !== null) {
        const existing = await Product.findOne({ where: { sku: skuNormalized } });
        if (existing && Number(existing.id) !== Number(product.id)) {
          return res.status(409).json({ message: 'SKU already exists. Please use a unique SKU.' });
        }
      }
      updates.sku = skuNormalized;
    }

    if (typeof category_id !== 'undefined') {
      const categoryIdNum = category_id === '' || category_id === null ? NaN : parseInt(category_id, 10);
      if (Number.isNaN(categoryIdNum)) {
        return res.status(400).json({ message: 'Category must be a valid number' });
      }
      const category = await Category.findByPk(categoryIdNum);
      if (!category) {
        return res.status(400).json({ message: 'Selected category does not exist' });
      }
      updates.category_id = categoryIdNum;
    }

    // Handle Main Image Update
    if (req.files && req.files['main_image'] && req.files['main_image'][0]) {
        // Find old primary image
        const oldPrimary = await ProductImage.findOne({ 
            where: { product_id: product.id, is_primary: true } 
        });

        if (oldPrimary) {
            // Delete old file
            safeUnlinkImage(oldPrimary.image_url);
            // Delete old record
            await oldPrimary.destroy();
        }

        // Create new primary image
        await ProductImage.create({
            product_id: product.id,
            image_url: normalizeUploadPath(req.files['main_image'][0].path),
            is_primary: true,
            sort_order: 0
        });
    }

    await product.update(updates);

    // Handle New Additional Images
    if (req.files && req.files['images']) {
         // Get current max sort order
         const maxSortOrder = await ProductImage.max('sort_order', { where: { product_id: product.id } }) || 0;
         
         const imagePromises = req.files['images'].map((file, index) => {
            return ProductImage.create({
                product_id: product.id,
                image_url: normalizeUploadPath(file.path),
                is_primary: false,
                sort_order: maxSortOrder + index + 1
            });
        });
        await Promise.all(imagePromises);
    }

    // Handle product variants replace (if "variants" or "variants_json" JSON string is provided)
    try {
      const rawVariants =
        (req.body && req.body.variants) ||
        (req.body && req.body.variants_json) ||
        null;
      if (rawVariants !== null && rawVariants !== undefined) {
        await createOrReplaceVariants(product.id, rawVariants);
      }
    } catch (variantErr) {
      console.error('Variant update failed (non-fatal):', variantErr);
    }

    // Return updated product with images + variants
    const updatedProduct = await Product.findByPk(product.id, {
        include: [
          { model: ProductImage, as: 'images' },
          { model: ProductVariant, as: 'variants', order: [['sort_order', 'ASC'], ['id', 'ASC']] }
        ]
    });

    const payload = updatedProduct ? updatedProduct.toJSON() : updatedProduct;
    if (payload && Array.isArray(payload.images)) {
      payload.images = payload.images.map((img) => ({
        ...img,
        image_url: normalizeStoredImageUrl(img.image_url),
      }));
    }
    attachVariantsAndEffectivePricing(payload);
    res.json(payload);
  } catch (error) {
    console.error('Error in updateProduct:', error);
    if (error && (error.name === 'SequelizeUniqueConstraintError' || error.code === 'ER_DUP_ENTRY')) {
      return res.status(409).json({ message: 'Duplicate value violates a unique constraint' });
    }
    return res.status(500).json({ message: 'Server error', error: error.message });
  }
};


exports.deleteProduct = async (req, res) => {
  try {
    const product = await Product.findByPk(req.params.id, {
        include: [{ model: ProductImage, as: 'images' }]
    });

    if (!product) {
      return res.status(404).json({ message: 'Product not found' });
    }

    // Delete associated images
    if (product.images && product.images.length > 0) {
        product.images.forEach(img => {
            safeUnlinkImage(img.image_url);
        });
    }

    // Manually delete images from DB (though cascade delete might work if set up, manual is safer here)
    await ProductImage.destroy({ where: { product_id: product.id } });
    
    await product.destroy();
    res.json({ message: 'Product deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};

exports.deleteProductImage = async (req, res) => {
  try {
    const imageId = req.params.id;
    const image = await ProductImage.findByPk(imageId);

    if (!image) {
      return res.status(404).json({ message: 'Image not found' });
    }

    // Delete file from filesystem
    if (image.image_url) {
        safeUnlinkImage(image.image_url);
    }

    await image.destroy();
    res.json({ message: 'Image deleted successfully' });
  } catch (error) {
    res.status(500).json({ message: 'Server error', error: error.message });
  }
};
