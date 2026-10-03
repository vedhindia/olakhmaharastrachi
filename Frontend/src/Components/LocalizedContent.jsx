import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

const translatedAttributes = ['alt', 'placeholder', 'aria-label', 'title'];
const contentRecords = new WeakMap();
const attributeRecords = new WeakMap();

const normalize = (value) => value.replace(/\s+/g, ' ').trim();

const translate = (value, t) => {
  const listSummary = value.match(/^Showing (\d+) of (\d+) Item On List$/);
  if (listSummary) {
    return t('Showing {{shown}} of {{total}} Item On List', {
      shown: listSummary[1],
      total: listSummary[2],
      defaultValue: value,
    });
  }

  const contactDetail = value.match(/^(Email|Phone|Mobile):\s*(.+)$/);
  if (contactDetail) {
    return `${t(contactDetail[1], { defaultValue: contactDetail[1] })}: ${contactDetail[2]}`;
  }

  const dayCount = value.match(/^(\d+)\s+days$/);
  if (dayCount) {
    return `${dayCount[1]} ${t('days', { defaultValue: 'days' })}`;
  }

  const discount = value.match(/^(\d+)% Off$/);
  if (discount) {
    return `${discount[1]}% ${t('Off', { defaultValue: 'Off' })}`;
  }

  const reviewCount = value.match(/^(\()?(\d+)\s+(Reviews?)(\))?$/);
  if (reviewCount) {
    const reviewLabel = Number(reviewCount[2]) === 1 ? 'Review' : 'Reviews';
    return `${reviewCount[1] || ''}${reviewCount[2]} ${t(reviewLabel, { defaultValue: reviewLabel })}${reviewCount[4] || ''}`;
  }

  const sku = value.match(/^SKU:\s*(.+)$/);
  if (sku) {
    return `${t('SKU', { defaultValue: 'SKU' })}: ${sku[1]}`;
  }

  const categories = value.match(/^Categories:\s*(.+)$/);
  if (categories) {
    return `${t('Categories:', { defaultValue: 'Categories:' })} ${t(categories[1], { defaultValue: categories[1] })}`;
  }

  return t(value, { defaultValue: value });
};

const translateContent = (node, t) => {
  const record = contentRecords.get(node);
  const source = record && node.nodeValue === record.rendered
    ? record.source
    : node.nodeValue;
  const normalized = normalize(source);
  if (!normalized) return;
  const translated = translate(normalized, t);
  const leading = source.match(/^\s*/)?.[0] || '';
  const trailing = source.match(/\s*$/)?.[0] || '';
  const result = `${leading}${translated}${trailing}`;

  if (node.nodeValue !== result) node.nodeValue = result;
  contentRecords.set(node, { source, rendered: result });
};

const translateAttributes = (element, t) => {
  let records = attributeRecords.get(element);
  if (!records) {
    records = new Map();
    attributeRecords.set(element, records);
  }

  translatedAttributes.forEach((attribute) => {
    if (!element.hasAttribute(attribute)) return;
    const current = element.getAttribute(attribute);
    const record = records.get(attribute);
    const source = record && current === record.rendered ? record.source : current;
    const translated = translate(normalize(source), t);
    if (current !== translated) element.setAttribute(attribute, translated);
    records.set(attribute, { source, rendered: translated });
  });
};

const translateTree = (root, t) => {
  if (root.nodeType === Node.TEXT_NODE) {
    translateContent(root, t);
    return;
  }

  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const element = root;
  if (['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(element.tagName)) return;
  translateAttributes(element, t);

  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let textNode;
  while ((textNode = walker.nextNode())) {
    if (!['SCRIPT', 'STYLE', 'NOSCRIPT'].includes(textNode.parentElement?.tagName)) {
      translateContent(textNode, t);
    }
  }
};

export default function LocalizedContent() {
  const { t, i18n } = useTranslation();

  useEffect(() => {
    const root = document.getElementById('root');
    if (!root) return undefined;

    const translate = (node) => translateTree(node, t);
    translate(root);
    document.documentElement.lang = i18n.language;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach((mutation) => {
        if (mutation.type === 'characterData') {
          translateContent(mutation.target, t);
        } else if (mutation.type === 'attributes') {
          translateAttributes(mutation.target, t);
        } else {
          mutation.addedNodes.forEach((node) => translate(node, t));
        }
      });
    });
    observer.observe(root, {
      subtree: true,
      childList: true,
      characterData: true,
      attributes: true,
      attributeFilter: translatedAttributes,
    });

    return () => observer.disconnect();
  }, [i18n.language, t]);

  return null;
}
